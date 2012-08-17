/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared').toRun(function() {

Object.subclass('users.cschuster.sync.Plugin', {
    setControl: function(control) { this.control = control; },
    addedObj: function(key, obj, optPatch) {},
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
    addedObj: function(key, obj, optPatch) {
        var transform;
        if (optPatch) {
            var patchData = optPatch.length == 4 ? optPatch[2] : optPatch.last();
            if (Array.isArray(patchData.owner)) {
                var oldOwner = patchData.owner.first();
                obj.owner = oldOwner; // neccessary for proper removing in addMorph
                transform = obj.getTransform();
            }
        }
        var firstHand = this.world.submorphs.find(function(m) { return m.isHand });
        this.world.addMorph(obj, firstHand);
        if (transform) obj.setTransform(transform);
    }
},
'setting', {
    fixSceneGraph: function(obj, patch, parentMorph) {
        for (var key in patch) {
            var value = patch[key];
            var isSubmorphArray = obj && obj.isMorph && key == "submorphs";
            if (Array.isArray(value)) { // instruction
                if (isSubmorphArray && value.length == 3) {
                    obj.removeAllMorphs();
                } else if (parentMorph) {
                    if (value.length == 3) { // delete
                        value.shift().remove();
                    } else { // add, set or move
                        var length = parentMorph.submorphs.length;
                        parentMorph.addMorph(obj[key],
                                             key < length ? parentMorph.submorphs[key + 1] : null);
                    }
                } else if (key == "owner" && value.length == 2) {
                    var newOwner = obj.owner;
                    value[0].removeMorph(obj); // previous owner
                    if (newOwner) obj.owner = newOwner;
                }
                if (value.length == 4) { // move
                    this.fixSceneGraph(obj[key], value[2], isSubmorphArray && obj);
                }
            } else {
                this.fixSceneGraph(obj[key], value, isSubmorphArray && obj);
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
                }
            } else {
                this.fixClosures(obj[key], value, isClosureObj && obj);
            }
        }
    },
    deleteConnections: function(obj, patch, parentObj) {
        for (var key in patch) {
            var isAttributeConnections = key == "attributeConnections";
            var value = patch[key];
            if (Array.isArray(value)) { // instruction
                if (isAttributeConnections) {
                    if (value.length == 3) value.shift().invoke('disconnect');
                } else if (parentObj && (value.length == 3 || value.length == 2)) {
                    value.shift().disconnect();
                }
            } else {
                this.deleteConnections(obj[key], value, isAttributeConnections && obj);
            }
        }
    },
    addConnections: function(obj, patch, parentObj) {
        for (var key in patch) {
            var isAttributeConnections = key == "attributeConnections";
            var value = patch[key];
            if (Array.isArray(value)) { // instruction
                if (parentObj && value.length == 1 && value.last() instanceof AttributeConnection) {
                    value.last().connect();
                }
            } else {
                this.addConnections(obj[key], value, isAttributeConnections && obj);
            }
        }
    },
    fixTextChunks: function(obj, patch, parentText) {
        for (var key in patch) {
            var isTextChunks = obj && obj.isText && key == "textChunks";
            var value = patch[key];
            if (parentText && obj[key] instanceof lively.morphic.TextChunk) {
                if (Array.isArray(value) && value.length == 1) { // add
                    var length = parentText.textChunks.length;
                    obj[key].addTo(parentText, key < length ? parentText.textChunks[key + 1] : null);
                } else { // update
                    obj[key].styleText();
                }
            } else if (!Array.isArray(value)) { // instruction
                this.fixTextChunks(obj[key], value, isTextChunks && obj);
            }
            // cleaning up cachedTextString if one of the chunks changed
            if (isTextChunks) delete obj.cachedTextString;
        }
    },
    updatedObj: function(key, obj, patch) {
        this.fixClosures(obj, patch);
        this.fixSceneGraph(obj, patch);
        this.deleteConnections(obj, patch);
        this.addConnections(obj, patch);
        this.fixTextChunks(obj, patch);
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

/* doNotSerializeForSync lists properties that are serialized but not synchronized */

lively.morphic.Text.addMethods({
    doNotSerializeForSync: ['cachedTextString', 'savedTextString']
});

lively.morphic.TextChunk.addMethods({
    doNotSerializeForSync: ['_id', 'debugMode']
});

lively.persistence.ObjectLinearizerPlugin.subclass('users.cschuster.sync.SyncPlugin',
'plugin interface', {
    ignoreProp: function(obj, propName, value) {
        return obj.doNotSerializeForSync && obj.doNotSerializeForSync.include(propName);
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
            if (!document.getElementById('loadSocketIO')) {
                var head = document.getElementsByTagName('head')[0];
                var socketscript = document.createElement('script');
                socketscript.type = 'text/javascript';
                socketscript.src =
                    'http://lively-kernel.org/nodejs/SyncServer/socket.io/socket.io.js';
                socketscript.id = 'loadSocketIO';
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
            var parts = path.length == 0 ? "" : path.split('/');
            var current = this.syncTable;
            for (var i = 0; current && (i < parts.length); i++) {
                current = current && current[parts[i]];
            }
            return current;
        },
        set: function(obj, prop, val) {
            if (val && Object.isObject(val) && val.__isSmartRef__) {
                return this.patchRef(obj, prop, val);
            }
            if (obj.isMorph && obj.isRendered() ||
                obj instanceof lively.morphic.Shapes.Shape && obj.hasOwnProperty('_renderContext')) {
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
            } else if (Array.isArray(patch.id) && existing && Object.isObject(existing) &&
                       (!existing.hasOwnProperty("id") || existing.id != patch.id[0])) {
                return {__isSmartRef__: true, id: newVal("id")};
            } else if (existing instanceof lively.Point) {
                return new lively.Point(newVal("x"), newVal("y"));
            } else if (existing instanceof lively.Rectangle) {
                return new lively.Rectangle(newVal("x"), newVal("y"),
                                            newVal("height"), newVal("width"));
            } else if (existing instanceof Color) {
                return Color.rgba(255*newVal("r"), 255*newVal("g"), 255*newVal("b"), newVal("a"));
            } else if (existing instanceof AttributeConnection) {
                if (!Array.isArray(obj)) return false;
                var newCon = existing.clone();
                this.applyObjectPatch(newCon, patch);
                return newCon;
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
                    if (value.length == 3) { // move
                        value.unshift(0);
                        this.applyObjectPatch(obj[key], value[2]);
                    } else if (value.length == 2) { // delete
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
            this.deserializeQueue.pushIfNotIncluded(obj);
        },
        findMoveInstructions: function(obj, patch) {
            var result = [];
            if (!obj || typeof obj != "object") return result;
            for (var key in patch) {
                var value = patch[key];
                if (Array.isArray(value)) {
                    if (value.length == 3) {
                        // defer actual moving object
                        result.push({from: {obj: this.objectAtPath(value[0]), path: value[0]},
                                     to: {obj: obj, prop: key}});
                    }
                } else {
                    result.pushAll(this.findMoveInstructions(obj[key], value));
                }
            }
            return result;
        },
        applyMoveInstructions: function(patch) {
            var moves = this.findMoveInstructions(this.syncTable, patch);
            var arraysToRepair = [];
            // apply all 'deletions' at once
            for (var i = 0; i < moves.length; i++) {
                var fromPath = moves[i].from.path;
                var lastPart = fromPath.lastIndexOf('/');
                var fromParent = this.objectAtPath(fromPath.substring(0, lastPart));
                var prop = fromPath.substring(lastPart + 1);
                if (fromParent) delete fromParent[prop];
                if (Array.isArray(fromParent)) arraysToRepair.pushIfNotIncluded(fromParent);
            }
            // repair all arrays
            arraysToRepair.invoke('repair');
            // apply all 'additions' at once
            for (var i = 0; i < moves.length; i++) {
                this.set(moves[i].to.obj, moves[i].to.prop, moves[i].from.obj);
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
            var hierachicalPatch = patch.toHierachicalPatch().data;
            this.serializer = users.cschuster.sync.Snapshot.getSerializer();
            this.serializer.addPlugins([new users.cschuster.sync.RepairArraysPlugin()]);
            this.deserializeQueue = [];
            this.refPatchQueue = [];
            this.applyMoveInstructions(hierachicalPatch);
            this.applyObjectPatch(this.syncTable, hierachicalPatch);
            newObjs = newObjs.map(function(v) { return this.objectAtPath(v) }.bind(this));
            this.refPatchQueue.each(function(ea) {
                this.patchRef(ea[0], ea[1], ea[2], newObjs);
            }.bind(this));
            this.deserializeQueue.each(function(obj) {
                this.serializer.letAllPlugins('afterDeserializeObj', [obj]);
            }.bind(this));
            this.serializer.letAllPlugins('deserializationDone', []);
            for (var key in hierachicalPatch) {
                var obj = this.objectAtPath(key);
                var patch = hierachicalPatch[key];
                if (Array.isArray(patch)) { // instruction
                    if (patch.length == 3) { // delete
                        this.plugins.invoke('removedObj', key, oldTable[key]);
                    } else { // add
                        this.plugins.invoke('addedObj', key, this.syncTable[key], patch);
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
    getSerializer: function() {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        var p = new GenericFilter();
        p.addFilter(function(obj, prop, value) {
            return value && Object.isObject(value) && value.isWorld;
        });
        serializer.addPlugins([p, new users.cschuster.sync.SyncPlugin()]);
        serializer.showLog = false;
        return serializer;
    },
    createFromObjects: function(object) {
        var s = new this();
        var serializer = this.getSerializer();
        s.data = serializer.serializeToJso(object);
        return s;
    }
});

users.cschuster.sync.Snapshot.addMethods({
    recreateObjects: function() {
        return this.constructor.getSerializer().deserializeJso(this.data);
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
