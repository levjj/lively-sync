/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared').toRun(function() {

Object.subclass('users.cschuster.sync.Plugin', {
    setControl: function(control) { this.control = control; },
    addedObj: function(key, obj) {},
    updatedObj: function(key, obj, patch) {},
    removedObj: function(key, obj) {}
});

users.cschuster.sync.Plugin.subclass('users.cschuster.sync.MorphPlugin',
'initializing', {
    initialize: function(world) {
        this.world = world || lively.morphic.World.current();
    }
},
'adding', {
    addedObj: function(key, obj) {
        this.world.addMorph(obj);
    }
},
'setting', {
    fixSceneGraph: function(obj, patch, parentMorph) {
        for (var key in patch) {
            var value = patch[key];
            if (Array.isArray(value)) { // instruction
                if (!parentMorph) return;
                if (value.length > 1) { // delete
                    value.shift().remove();
                }
                if (value.length == 1) { // add or set
                    parentMorph.addMorph(obj[key]);
                }
            } else {
                this.fixSceneGraph(obj[key], value, obj.isMorph && key == "submorphs" && obj);
            }
        }
    },
    updatedObj: function(key, obj, patch) {
        this.fixSceneGraph(obj, patch);
    }
},
'deleting', {
    removedObj: function(key, obj) {
        obj.remove();
    }
});

Object.subclass('users.cschuster.sync.WorkingCopy',
    'initializing', {
        initialize: function(keepHistory) {
            this.plugins = [];
            this.syncTable = {};
            this.rev = 0;
            this.loadSocketIO();
            if (keepHistory) {
                this.snapshots = {};
                this.patches = {};
            } else {
                this.last = users.cschuster.sync.Snapshot.empty();
            }
        },
        loadSocketIO: function() {
            if (!Global['io']) {
                var head = document.getElementsByTagName('head')[0];
                var socketscript = document.createElement('script');
                socketscript.type = 'text/javascript';
                socketscript.src =
                    'http://lively-kernel.org/nodejs/SyncServer/socket.io/socket.io.js';
                head.appendChild(socketscript);
            }
        },
        addPlugin: function(plugin) {
            this.plugins.push(plugin);
            plugin.setControl(this);
        }
    },
    'serialization', {
        objectAtPath: function(path) {
            var parts = path.split('/');
            var parent = null;
            var current = this.syncTable;
            for (var i = 0; current && (i < parts.length); i++) {
                parent = current;
                current = current && current[parts[i]];
            }
            return current;
        },
        set: function(obj, prop, val) {
            if (val && Object.isObject(val) && val.__isSmartRef__) {
                return this.patchRef(obj, prop, val);
            }
            if (obj.isMorph || obj instanceof lively.morphic.Shapes.Shape) {
                var propName = prop.capitalize();
                if (propName.startsWith('_')) propName = propName.substring(1);
                var setter = obj['set' + propName];
                if (Object.isFunction(setter)) {
                    return setter.call(obj, val);
                }
            }
            return obj[prop] = val;
        },
        patchRef: function(object, prop, smartRef) {
            this.refPatchQueue.push(function() {
                this.set(object, prop, this.objectAtPath(smartRef.id));
            });
        },
        recreateObject: function(object) {
            if (!object || !Object.isObject(object) || Array.isArray(object)
                        || !object.__LivelyClassName__ || object.__isSmartRef__) {
                return object;
            }
            var serializer = ObjectGraphLinearizer.forNewLively();
            var recreated = serializer.somePlugin('deserializeObj', [object]);
            for (var key in object) {
                var val = object[key];
                if (val.__isSmartRef__) {
                    this.patchRef(recreated, key, val);
                } else {
                    recreated[key] = this.recreateObject(val);
                }
            }
            this.deserializeQueue.push(function() {
                serializer.letAllPlugins('afterDeserializeObj', [recreated]);
                serializer.letAllPlugins('deserializationDone', [recreated]);
            });
            return recreated;
        },
        tryPatchValueObject: function(existing, patch) {
            function newVal(prop) {
                return patch.hasOwnProperty(prop) ? patch[prop][0] : existing[prop];
            }
            if (patch.hasOwnProperty("__LivelyClassName__")) {
                return false; // do not recreate value object if class was changed
            } else if (existing instanceof lively.Point) {
                return new lively.Point(newVal("x"), newVal("y"));
            } else if (existing instanceof lively.Rectangle) {
                return new lively.Rectangle(newVal("x"), newVal("y"),
                                            newVal("height"), newVal("width"));
            } else if (existing instanceof Color) {
                return Color.rgba(255*newVal("r"), 255*newVal("g"), 255*newVal("b"), newVal("a"));
            } else {
                return false;
            }
        },
        applyObjectPatch: function(obj, patch) {
            for (var key in patch) {
                var value = patch[key];
                if (Array.isArray(value)) { // instruction
                    if (value.length == 2) { // delete
                        value.unshift(obj[key]);
                        if (Array.isArray(obj)) {
                            obj.removeAt(key);
                        } else {
                            this.set(obj, key, undefined);
                            delete obj[key];
                        }
                    } else { // add or set
                        if (obj.hasOwnProperty(key)) value.unshift(obj[key]);
                        this.set(obj, key, this.recreateObject(value.last()));
                    }
                } else {
                    var patchedValueObject = this.tryPatchValueObject(obj[key], value);
                    if (patchedValueObject) {
                        var newPatch = [patchedValueObject];
                        if (obj.hasOwnProperty(key)) newPatch.unshift(obj[key]);
                        patch[key] = newPatch;
                        this.set(obj, key, patchedValueObject);
                    } else {
                        this.applyObjectPatch(obj[key], value);
                    }
                }
            }
        }
    },
    'updating', {
        connect: function(autoupdate) {
            this.socket = io.connect(null, {resource: 'nodejs/SyncServer/socket.io'});
            this.socket.on("snapshot", this.receiveSnapshot.bind(this));
            this.socket.on("patch", this.receivePatch.bind(this));
            this.autoupdate = autoupdate;
            if (this.autoupdate) {
                if (this.snapshots) this.loadRev(Object.keys(this.snaphots).last());
                this.socket.emit('update', this.rev);
            }
            console.log("connected");
        },
        disconnect: function() {
            this.socket.disconnect();
            delete this.socket;
            this.loadSnapshot(users.cschuster.sync.Snapshot.empty());
            this.rev = 0;
            console.log("disconnected");
        },
        receiveSnapshot: function(rev, snapshot) {
            if (!this.autoupdate && this.rev != rev) return;
            if (this.snapshots) {
                this.snapshots[rev] = new users.cschuster.sync.Snapshot(snapshot);
            } else {
                this.last = new users.cschuster.sync.Snapshot(snapshot);
            }
            console.log('received snapshot for rev ' + rev);
            debugger;
            this.loadSnapshot(this.last || this.snapshots[rev]);
            this.rev = rev;
        },
        receivePatch: function(rev, patch) {
            if (!this.autoupdate && this.rev != rev) return;
            patch = new users.cschuster.sync.Patch(patch);
            if (this.snapshots) {
                var last = this.snapshots[this.rev]
                delete this.snapshots[this.rev];
                this.patches[this.rev] = patch;
                this.snapshots[rev] = last;
            } else {
                var last = this.last
            }
            patch.apply(last);
            this.loadPatch(patch);
            this.rev = rev;
        },
        loadSnapshot: function(snapshot) {
            Properties.forEachOwn(this.syncTable, function(key, val) {
                this.plugins.invoke('removedObj', val.id, val);
                this.removeObject(val);
            }, this);
            var objects = snapshot.recreateObjects();
            Properties.forEachOwn(objects, function(key, val) {
                this.addObject(val);
                this.plugins.invoke('addedObj', val.id, val);
            }, this);
        },
        loadPatch: function(patch) {
            var oldTable = Object.extend({}, this.syncTable);
            var rawPatch = patch.toHierachicalPatch().data;
            this.deserializeQueue = [];
            this.refPatchQueue = [];
            this.applyObjectPatch(this.syncTable, rawPatch);
            this.refPatchQueue.invoke('call', this);
            this.deserializeQueue.invoke('call', this);
            for (var key in rawPatch) {
                var obj = this.objectAtPath(key);
                var patch = rawPatch[key];
                if (Array.isArray(patch)) { // instruction
                    if (patch.length == 3) { // delete
                        this.plugins.invoke('removedObj', key, oldTable[key]);
                    } else { // add
                        this.plugins.invoke('addedObj', key, this.syncTable[key]);
                    }
                } else { // set
                    this.plugins.invoke('updatedObj', key, this.syncTable[key], patch);
                }
            }
        },
        loadRev: function(rev) {
            if (!this.socket) return;
            if (!rev) return;
            if (this.rev == rev) return;
            this.rev = rev;
            if (!this.snapshots || !this.snapshots[rev]) {
                this.socket.emit('checkout', this.rev);
            } else {
                this.loadSnapshot(this.snapshots[rev]);
            }
        }
    },
    'syncing', {
        addObject: function(obj) {
            this.syncTable[obj.id] = obj;
        },
        removeObject: function(obj) {
            delete this.syncTable[obj.id];
        },
        commit: function() {
            var current = users.cschuster.sync.Snapshot.createFromObjects(this.syncTable);
            var last = this.last || this.snapshots[this.rev];
            var patch = last.diff(current).toPatch();
            if (patch.isEmpty()) return;
            if (this.socket) this.socket.emit('commit', this.rev, patch);
            if (this.snapshots) {
                this.snapshots[this.rev + 1] = current;
                this.patches[this.rev + 1] = patch;
            } else {
                this.last = current;
            }
            this.rev++;
            console.log('commited snapshot for rev ' + this.rev);
            return [current.toJSON().length, patch.toJSON().length];
        }
    }
);

Object.extend(users.cschuster.sync.Snapshot, {
    createFromObjects: function(object) {
        var s = new this();
        var serializer = s.getSerializer();
        s.data = serializer.serializeToJso(object);
        return s;
    }
});

users.cschuster.sync.Snapshot.addMethods({
    getSerializer: function(data) {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        var p = new GenericFilter();
        p.addFilter(function(obj, prop, value) {
            return obj.isScript && prop == "currentTimeout";
        });
        serializer.addPlugins([p]);
        serializer.showLog = false;
        return serializer;
    },
    recreateObjects: function() {
        return this.getSerializer().deserializeJso(this.data);
    }
});

cop.create("HierachicalIds").refineClass(lively.persistence.ObjectGraphLinearizer, {
    newId: function() {
        var id = this.path.join('/');
        if (this.registry.hasOwnProperty(id))
            throw new Error("ID '" + id + "' already assigned");
        return id;
    }
}).beGlobal();

});
