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
    isSubmorphInstruction: function(patch) {
        
    },
    fixSceneGraph: function(orig, patch) {
        
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

Object.subclass('users.cschuster.sync.Control',
    'initializing', {
        initialize: function() {
            this.plugins = [];
            this.snapshots = {};
            this.patches = {};
            this.syncTable = {};
            this.rev = 0;
            this.loadSocketIO();
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
                        this.set(obj, key, undefined);
                        delete obj[key];
                    } else { // add or set
                        this.set(obj, key, this.recreateObject(value[0]));
                    }
                } else {
                    var patchedValueObject = this.tryPatchValueObject(obj[key], value);
                    if (patchedValueObject) {
                        this.set(obj, key, patchedValueObject);
                    } else {
                        this.applyObjectPatch(obj[key], value);
                    }
                }
            }
        }
    },
    'updating', {
        connect: function() {
            this.socket = io.connect(null, {resource: 'nodejs/SyncServer/socket.io'});
            this.socket.on("snapshot", this.receiveSnapshot.bind(this));
            this.socket.on("patch", this.receivePatch.bind(this));
            if (this.maxRevision() > 0) this.loadRev(this.maxRevision());
            (function(){this.socket.emit('update', this.rev)}).bind(this).delay(1);
            console.log("connected");
        },
        disconnect: function() {
            this.socket.disconnect();
            delete this.socket;
            //FIXME: this does not work for all kinds of objects
            Object.values(this.syncTable).invoke('remove');
            this.syncTable = {};
            this.rev = 0;
            console.log("disconnected");
        },
        receiveSnapshot: function(rev, snapshot) {
            var oldMax = this.maxRevision();
            this.snapshots[rev] = new users.cschuster.sync.Snapshot(snapshot);
            console.log('received snapshot for rev ' + rev);
            if (this.rev == oldMax) {
                this.rev = rev;
                this.loadSnapshot(this.snapshots[rev]);
            } else {
                signal(this, "rev", this.rev);
            }
        },
        receivePatch: function(rev, patch) {
            this.patches[rev] = patch;
            if (this.rev + 1 !== rev) {
                console.warn("received patch for rev " + rev + " but local rev is " + this.rev);
                //this.socket.emit('update', this.rev);
            } else {
                var last = this.snapshots[this.rev];
                delete this.snapshots[this.rev];
                this.rev = rev;
                patch = new users.cschuster.sync.Patch(patch);
                patch.apply(last);
                this.snapshots[this.rev] = last;
                this.loadPatch(patch);
            }
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
                    if (patch.length == 2) { // delete
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
            if (this.rev == rev) return;
            this.rev = rev;
            if (!this.snapshots[rev]) {
                this.socket.emit('checkout', this.rev);
            } else {
                this.loadSnapshot(this.snapshots[rev]);
            }
        },
        maxRevision: function() {
            var max = 0;
            for (var rev in this.snapshots) {
                if ((+rev) > max) max = (+rev);
            }
            return max;
        }
    },
    'syncing', {
        addObject: function(obj) {
            this.syncTable[obj.id] = obj;
        },
        removeObject: function(obj) {
            delete this.syncTable[obj.id];
        },
        startSyncing: function() {
            this.commitTimeout = setTimeout(this.commit.bind(this), 1000);
            console.log("started syncing");
        },
        stopSyncing: function() {
            clearTimeout(this.commitTimeout);
            this.commitTimeout = null;
            console.log("stopped syncing");
        },
        commit: function() {
            var start = Date.now();
            try {
                var current = new users.cschuster.sync.Snapshot();
                current.createFromObjects(this.syncTable);
                var last = this.snapshots[this.rev];
                debugger;
                var patch = last.diff(current).toPatch();
                if (patch.isEmpty()) return;
                //TODO: send patches instead of snapshots
                this.socket.emit('commit', this.rev, current);
                this.snapshots[this.rev + 1] = current;
                this.patches[this.rev + 1] = patch;
                this.rev++;
                console.log('commited snapshot for rev ' + this.rev);
            } finally {
                var commitTime = Date.now() - start;
                this.commitTimeout = setTimeout(
                    this.commit.bind(this),
                    Math.max(100, commitTime * 4));
            }
        }
    }
);

users.cschuster.sync.Snapshot.addMethods({
    getSerializer: function(data) {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        serializer.addPlugins(lively.persistence.getPluginsForLively());
        var p = new GenericFilter();
        p.addFilter(function(obj, prop, value) {
            return obj.isScript && prop == "currentTimeout";
        });
        serializer.addPlugins([p]);
        serializer.showLog = false;
        return serializer;
    },
    createFromObjects: function(object) {
        var serializer = this.getSerializer();
        this.data = serializer.serializeToJso(object);
        return this;
    },
    recreateObjects: function() {
        return this.getSerializer().deserializeJso(this.data);
    },
    recreateObject: function(id) {
        var serializer = this.getSerializer();
        serializer.addPlugin(/* only restore stuff with prefix / with id*/);
        var obj = serializer.recreateFromId(id);
        return obj;
    }
});


cop.create("HierachicalIds").refineClass(lively.persistence.ObjectGraphLinearizer, {
    newId: function() {
        var id = this.path.join('/');
        while (this.registry[id]) id = "#" + id;
        return id;
    }
}).beGlobal();

});
