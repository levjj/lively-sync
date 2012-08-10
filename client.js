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
                if (!parentMorph) continue;
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
    removeAllClosures: function(obj) {
        Functions.own(obj).
	   select(function(name) { return obj[name].getOriginal().hasLivelyClosure }).
	   each(function(name) { delete obj[name] });
    },
    fixClosures: function(obj, patch, parentObject) {
        for (var key in patch) {
            var isClosureObj = key == "__serializedLivelyClosures__";
            var value = patch[key];
            if (Array.isArray(value)) { // instruction
                if (value.length == 3) { // delete
                    if (isClosureObj) this.removeAllClosures(obj);
                    if (parentObject) delete parentObject[key];
                } else { // add or set
                    //parentMorph.addScript(obj[key]);
                }
            } else {
                this.fixClosures(obj[key], value, isClosureObj && obj);
            }
        }
    },
    updatedObj: function(key, obj, patch) {
        this.fixClosures(obj, patch);
        this.fixSceneGraph(obj, patch);
    }
},
'deleting', {
    removedObj: function(key, obj) {
        obj.remove();
    }
});

lively.persistence.ObjectLinearizerPlugin.subclass('users.cschuster.sync.RepairArraysPlugin',
'plugin interface', {
    afterDeserializeObj: function(obj) {
        if (Array.isArray(obj)) obj.repair();
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
        patchRef: function(object, prop, smartRef, newObjs) {
            if (!newObjs) {
                this.refPatchQueue.push([object, prop, smartRef.id]);
            } else {
                if (newObjs.include(object)) {
                    object[prop] = this.objectAtPath(smartRef);
                } else {
                    this.set(object, prop, this.objectAtPath(smartRef));
                }
            }
        },
        recreateObject: function(object) {
            if (!object || !Object.isObject(object) || object.__isSmartRef__) {
                return object;
            }
            var recreated = Array.isArray(object) ? [] :
                this.serializer.somePlugin('deserializeObj', [object]) || {};
            for (var key in object) {
                if (!object.hasOwnProperty(key)) continue;
                var val = object[key];
                if (val && Object.isObject(val) && val.__isSmartRef__) {
                    this.patchRef(recreated, key, val);
                } else {
                    recreated[key] = this.recreateObject(val);
                }
            }
            this.deserializeQueue.push(recreated);
            return recreated;
        },
        tryPatchValueObject: function(obj, key, patch) {
            var existing = obj[key];
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
            } else if (existing instanceof lively.Closure) {
                return new lively.Closure(null, newVal("varMapping"), newVal("source"), null);
            } else if (key == '__serializedLivelyClosures__') {
                var newClosures = {}
                Functions.own(obj).forEach(function(funcName) {
                    var func = obj[funcName];
                    if (!func || !func.hasLivelyClosure) return;
                    var closure = func.livelyClosure;
                    newClosures[funcName] = closure;
                    if (!closure.hasFuncSource()) {
                        closure.setFuncSource(closure.originalFunc.toString());
                    }
                });
                obj['__serializedLivelyClosures__'] = newClosures;
                return false;
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
                        this.set(obj, key, undefined);
                        delete obj[key];
                    } else { // add or set
                        if (obj.hasOwnProperty(key)) value.unshift(obj[key]);
                        this.set(obj, key, this.recreateObject(value.last()));
                    }
                } else { // path
                    var patchedValueObject = this.tryPatchValueObject(obj, key, value);
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
            this.deserializeQueue.push(obj);
        },
        performCopyInstructions: function(obj, patch) {
            if (!obj || typeof obj != "object") return;
            for (var key in patch) {
                var value = patch[key];
                if (Array.isArray(value)) {
                    if (value.length == 3) {
                        // defer actual copying object
                        this.refPatchQueue.push([obj, key, this.objectAtPath(value[0])]);
                        patch[key] = value[1]; // insert additional patch
                    }
                } else {
                    this.performCopyInstructions(obj[key], value);
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
            if (this.socket) this.socket.disconnect();
            delete this.socket;
            this.loadSnapshot(users.cschuster.sync.Snapshot.empty());
            this.rev = 0;
            console.log("disconnected");
        },
        receiveSnapshot: function(rev, snapshot) {
            console.log('received snapshot for rev ' + rev);
            if (this.onConnect) { this.onConnect(); delete this.onConnect; }
            if (!this.autoupdate && this.rev != rev) return;
            if (this.snapshots) {
                this.snapshots[rev] = new users.cschuster.sync.Snapshot(snapshot);
            } else {
                this.last = new users.cschuster.sync.Snapshot(snapshot);
            }
            this.loadSnapshot(this.last || this.snapshots[rev]);
            this.rev = rev;
        },
        receivePatch: function(rev, patch) {
            console.log("received patch for rev " + rev);
            if (this.onConnect) { this.onConnect(); delete this.onConnect; }
            if (!this.autoupdate && this.rev != rev) return;
            patch = new users.cschuster.sync.Patch(patch);
            var last;
            if (this.snapshots) {
                last = this.snapshots[this.rev];
                delete this.snapshots[this.rev];
                this.patches[this.rev] = patch;
                this.snapshots[rev] = last;
            } else {
                last = this.last;
            }
            patch.recreate(last);
            this.loadPatch(patch.clone());
            patch.apply(last);
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
            var newObjs = Object.keys(patch.data).
                select(function(v) { return Array.isArray(patch.data[v]) &&
                                            patch.data[v].length < 3 });
            var rawPatch = patch.toHierachicalPatch().data;
            this.serializer = ObjectGraphLinearizer.forNewLively();
            this.serializer.addPlugins([new users.cschuster.sync.RepairArraysPlugin()]);
            this.deserializeQueue = [];
            this.refPatchQueue = [];
            this.performCopyInstructions(this.syncTable, rawPatch);
            this.refPatchQueue.each(function(ea) { ea[0][ea[1]] = ea[2]; });
            this.refPatchQueue = [];
            this.applyObjectPatch(this.syncTable, rawPatch);
            newObjs = newObjs.map(function(v) { return this.objectAtPath(v) }.bind(this));
            this.refPatchQueue.each(function(ea) {
                this.patchRef(ea[0], ea[1], ea[2], newObjs);
            }.bind(this));
            this.deserializeQueue.each(function(obj) {
                this.serializer.letAllPlugins('afterDeserializeObj', [obj]);
            }.bind(this));
            this.serializer.letAllPlugins('deserializationDone', []);
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
            if (patch.isEmpty()) return null;
            if (this.socket) this.socket.emit('commit', this.rev, patch);
            if (this.snapshots) {
                this.snapshots[this.rev + 1] = current;
                this.patches[this.rev + 1] = patch;
            } else {
                this.last = current;
                this.lastPatch = patch;
            }
            this.rev++;
            console.log('commited patch for rev ' + this.rev);
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
            return value && Object.isObject(value) && value.isWorld;
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
    },
    addNewRegistryEntry: function(id, obj) {
        var oldPath = this.path.clone();
        this.path = oldPath.length == 0 ? [] : id.split('/');
        try {
            cop.proceed(id, obj);
        } finally {
            this.path = oldPath;
        }
    },
    addIdToAllProperties: function(source, keys) {
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!source.hasOwnProperty(key)) continue;
            var value = source[key];
            if (!value || !Object.isObject(value)) continue;
            this.path.push(key);
            if (Array.isArray(value)) {
                var indices = Array.range(0, value.length - 1).reject(function(ea) {
                    return this.somePlugin('ignoreProp', [value, ea, value[ea]]);
                }.bind(this));
                this.addIdToAllProperties(value, indices);
            } else {
                if (this.getIdFromObject(value) === undefined) this.addIdToObject(value);
            }
            this.path.pop();
        }
    },
    copyPropertiesAndRegisterReferences: function(source, copy) {
        var keys = Object.keys(source);
        keys.remove(this.idProperty);
        keys = keys.reject(function(ea) {
            return this.somePlugin('ignoreProp', [source, ea, source[ea]]);
        }.bind(this));
        keys = keys.sort();
        this.addIdToAllProperties(source, keys);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!source.hasOwnProperty(key))
                continue;
            var value = source[key];
            copy[key] = this.registerWithPath(value, key);
        }
    }
}).beGlobal();

});
