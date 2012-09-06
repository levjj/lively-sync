/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared', 'lively.morphic.AdditionalMorphs', 'users.cschuster.Serialization').toRun(function() {

Object.extend(users.cschuster.sync.Snapshot, {
    getSerializer: function() {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        serializer.plugins.remove(serializer.plugins.find(function(p) {
            return p instanceof lively.persistence.ClassPlugin;
        }));
        var expressionPlugin = new users.cschuster.SerializeAsExpressionPlugin();
        var classPlugin = new users.cschuster.sync.ClassPlugin();
        var syncPlugin = new users.cschuster.sync.SyncPlugin();
        var worldPlugin = new GenericFilter();
        worldPlugin.addFilter(function(obj, prop, value) {
            return value && Object.isObject(value) && value.isWorld;
        });
        serializer.addPlugins([expressionPlugin, classPlugin, syncPlugin, worldPlugin]);
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

users.cschuster.sync.Patch.addMethods({
    toHierachicalPatch: function() {
        var newPatch = {};
        function removeAdds(obj) {
            if (!obj || !Object.isObject(obj)) return obj;
            if (Array.isArray(obj)) {
                if (obj.length == 1) { // add
                    return obj[0];
                } else if (obj.length == 3) { // move
                    return {__isMoveInstruction__: true, from: obj[0], diff: obj[1]};
                }
            } else {
                for (var key in obj) obj[key] = removeAdds(obj[key]);
            }
            return obj;
        }
        var keys = Object.keys(this.data).sort();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var val = this.data[key];
            var parts = key.split('/');
            var current = newPatch;
            var rawMode = false;
            for (var j = 0; j < parts.length - 1; j++) {
                if (!current[parts[j]]) {
                    current[parts[j]] = {};
                }
                current = current[parts[j]];
                if (!rawMode && Array.isArray(current)) {
                    if (current.length == 1) { // add
                        rawMode = true;
                        current = current[0];
                    } else { // move
                        current = current[1];
                    }
                }
                if (rawMode && current.__isMoveInstruction__) { // move instruction in raw obj
                    rawMode = false;
                    current = current.diff;
                }
            }
            var prop = parts.last();
            if (!current.hasOwnProperty(prop) || current[prop].id == key ||
                (Array.isArray(current[prop].id) && current[prop].id[0] == key)) {
                current[prop] = rawMode ? removeAdds(val) : val;
            }
        }
        return new users.cschuster.sync.Patch(newPatch);
    }
});

Object.subclass('users.cschuster.sync.Plugin', {
    setControl: function(control) { this.control = control; },
    add: function(objects) {},
    afterPatching: function(objects, patch) {},
    remove: function(objects) {}
});

users.cschuster.sync.Plugin.subclass('users.cschuster.sync.MorphPlugin',
'initializing', {
    initialize: function(world) {
        this.world = world || lively.morphic.World.current();
    }
},
'loading', {
    add: function(objects) {
        Properties.forEachOwn(objects, function(name, morph) {
            var firstHand = this.world.submorphs.find(function(m) { return m.isHand });
            this.world.addMorph(morph, firstHand);
        }, this);
    },
},
'patching', {
    fixSceneGraph: function(obj, patch, parentMorph) {
        for (var key in patch) {
            var value = patch[key];
            var isSubmorphArray = obj && obj.isMorph && key == "submorphs";
            if (Array.isArray(value)) { // instruction
                if (isSubmorphArray && value.length == 3) {
                    obj.removeAllMorphs();
                } else if (parentMorph) {
                    if (value.length == 3) { // delete
                        var morph = value.shift()
                        if (morph !== this.world.firstHand()) morph.remove();
                    } else { // add, set or move
                        if (!obj.hasOwnProperty(key)) continue;
                        var length = parentMorph.submorphs.length;
                        var morphBefore = key < length ? parentMorph.submorphs[key + 1] : null;
                        if (parentMorph == this.world) {
                            morphBefore = this.world.submorphs.find(function(m) { return m.isHand });
                            if (value.length == 4 && Array.isArray(value[2].owner)) {
                                // need to reset owner to old value for proper removing in addMorph
                                obj[key].owner = value[2].owner.first();
                                var transform = obj[key].getTransform();
                            }
                        }
                        //FIXME: addMorph also invoked "Tab.remove()" which is broken
                        //       instead of skipping the addMorph for tabs we should rather fix it
                        if (obj[key] instanceof lively.morphic.Tab)
                            obj[key].isInActivationCycle = true;
                        parentMorph.addMorph(obj[key], morphBefore);
                        if (obj[key] instanceof lively.morphic.Tab)
                            delete obj[key].isInActivationCycle;
                        if (transform) obj[key].setTransform(transform);
                    }
                } else if (key == "owner" && value.length == 2 && value[0]) {
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
            if (parentText) {
                if (Array.isArray(value)) {
                    if (value.length == 1) { // add
                        var length = parentText.textChunks.length;
                        obj[key].addTo(parentText, key < length ? parentText.textChunks[key+1] : null);
                    } else if (value.length == 3) { // remove
                        value[0].remove();
                    }
                } else if (value.hasOwnProperty("style")){ // update style
                    obj[key].styleText();
                }
            } else if (!Array.isArray(value)) { // recursion
                this.fixTextChunks(obj[key], value, isTextChunks && obj);
            }
            // cleaning up cachedTextString if one of the chunks changed
            if (isTextChunks) delete obj.cachedTextString;
        }
    },
    fixLists: function(obj, patch) {
        for (var key in patch) {
            var value = patch[key];
            if (obj && obj instanceof lively.morphic.List && key == "itemList") {
                obj.updateList(obj.itemList);
            } else if (!Array.isArray(value)) { // recursion
                this.fixLists(obj[key], value);
            }
        }
    },
    fixPaths: function(obj, patch) {
        for (var key in patch) {
            var value = patch[key];
            if (obj && obj instanceof lively.morphic.Shapes.Path && key == "_PathElements") {
                obj.setPathElements(obj.getPathElements());
            } else if (!Array.isArray(value)) { // recursion
                this.fixPaths(obj[key], value);
            }
        }
    },


    afterPatching: function(objects, patch) {
        this.fixClosures(objects, patch);
        this.fixSceneGraph(objects, patch, this.world);
        this.deleteConnections(objects, patch);
        this.addConnections(objects, patch);
        this.fixTextChunks(objects, patch);
        this.fixLists(objects, patch);
        this.fixPaths(objects, patch);
    }
},
'removing', {
    remove: function(objects) {
        var firstHand = this.world.firstHand();
        Properties.forEachOwn(objects, function(name, morph) {
            if (morph != firstHand) morph.remove();
        }, this);
    }
});
lively.morphic.TabPane.addMethods({
    remove: function($super) {
        var tab = this.getTab();
        if (tab) tab.isInActivationCycle = true;
        $super();
        if (tab) delete tab.isInActivationCycle;
    }
});

Array.addMethods({
    repair: Array.prototype.mutableCompact
});

lively.persistence.ObjectLinearizerPlugin.subclass('users.cschuster.sync.RepairArraysPlugin',
'plugin interface', {
    afterDeserializeObj: function(obj) {
        if (Array.isArray(obj)) obj.repair();
    }
});

/* doNotSerializeForSync lists properties that are serialized but not synchronized */

lively.morphic.Text.addMethods(
'serialization', {
    doNotSerializeForSync: ['partsBinMetaInfo', 'partTests', 'textString', 'cachedTextString']
});
lively.morphic.Morph.addMethods({
    doNotSerializeForSync: ['partsBinMetaInfo', 'partTests', 'priorExtent'],
    getGrabShadow: function(local) {
        var shadow = new lively.morphic.Morph(
            lively.persistence.Serializer.newMorphicCopy(this.shape));
        shadow.isGrabShadow = true;
        shadow.applyStyle({
            fill: this.getFill() === null ? Color.gray : Color.gray.darker(), opacity: 0.5})
        shadow.connections = [
            lively.bindings.connect(this, 'rotation', shadow, 'setRotation'),
            lively.bindings.connect(this, 'scale', shadow, 'setScale')];
        shadow.addScript(function remove() {
            $super();
            this.connections.invoke('disconnect');
            this.submorphsForReconnect = this.submorphs.clone();
            this.submorphs.invoke('remove');
            lively.bindings.callWhenNotNull(this, 'owner', this, 'reconnect');
        });
        shadow.addScript(function reconnect(newOwner) {
            this.connections.invoke('connect');
            this.submorphsForReconnect.forEach(function(ea) { this.addMorph(ea) }, this);
            delete this.submorphsForReconnect;
        });
        shadow.setTransform(local ? this.getTransform() : this.getGlobalTransform());
        shadow.disableDropping();
        return shadow;
    }
});
lively.morphic.Button.addMethods(
'serialization', {
    doNotSerializeForSync: ['partsBinMetaInfo', 'partTests', 'fire']
});
lively.morphic.TextChunk.addMethods({
    doNotSerializeForSync: ['_id', 'debugMode']
});
lively.morphic.Shapes.Path.addMethods({
    doNotSerializeForSync: ['cachedVertices', 'controlPoints']
});

lively.persistence.ObjectLinearizerPlugin.subclass('users.cschuster.sync.SyncPlugin',
'plugin interface', {
    deserializeObj: function(persistentCopy) {
        if (!persistentCopy.__isMoveInstruction__) return;
        var obj = persistentCopy.from;
        this.serializer.wc.applyObjectPatch(obj, persistentCopy.diff);
        delete persistentCopy.from;
        delete persistentCopy.diff;
        delete persistentCopy.__isMoveInstruction__;
        return obj;
    },
    ignoreProp: function(obj, propName, value) {
        return obj.doNotSerializeForSync && obj.doNotSerializeForSync.include(propName);
    }
});

lively.persistence.ClassPlugin.subclass('users.cschuster.sync.ClassPlugin',
'plugin interface', {
    deserializeObj: function($super, persistentCopy) {
        var moduleNames = [];
        if (persistentCopy['__SourceModuleName__'])
            moduleNames.push(persistentCopy['__SourceModuleName__']);
        if (persistentCopy['requiredModules'])
            moduleNames.pushAll(persistentCopy['requiredModules']);
        moduleNames
            .reject(function(ea) { return ea.startsWith('Global.anonymous_') || ea.include('undefined') })
            .uniq()
            .each(function(ea) { var m = module(ea); if (m != Global && !m.isLoaded()) m.load(true) });
        return $super(persistentCopy);
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
'accessing', {
    isConnected: function() {
        return !!this.socket;
    },
    isSyncing: function() {
        return !!this.commitTimeout;
    }
},
'serialization', {
    objectAtPath: function(path) {
        var parts = path.length == 0 ? "" : path.split('/');
        var current = this.syncTable;
        for (var i = 0; current && (i < parts.length); i++) {
            current = current && current[parts[i]];
        }
        if (!current || !Object.isObject(current)) return this.cannotFindObject(path);
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
            if (prop == 'owner') obj.remove();
        }
        return obj[prop] = val;
    },
},
'patching', {
    patchRef: function(object, prop, smartRef, newObjs) {
        if (!newObjs) {
            this.refPatchQueue.push([object, prop, smartRef.id]);
        } else {
            var ref = this.objectAtPath(smartRef);
            if (!ref) return;
            if (newObjs.include(object)) {
                object[prop] = ref;
            } else {
                this.set(object, prop, ref);
            }
        }
    },
    recreateObject: function(object) {
        if (object && Object.isString(object) && object.startsWith("\\$@")) {
            return eval(object.substring(3));
        }
        if (!object || !Object.isObject(object) || object.__isSmartRef__) {
            return object;
        }
        var recreated = Array.isArray(object) ? [] :
            this.serializer.somePlugin('deserializeObj', [object]) || {};
        for (var key in object) {
            if (!object.hasOwnProperty(key)) continue;
            var val = object[key];
            if (this.serializer.somePlugin('ignorePropDeserialization', [object, key, val]))
                continue;
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
        if (!obj || !Object.isObject(obj)) return this.cannotApplyPatch(obj, patch);
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
},
'moving', {
    findMoveInstructionsInRawObject: function(obj, result) {
        for (var key in obj) {
            if (!obj.hasOwnProperty(key)) return;
            var value = obj[key];
            if (!value || !Object.isObject(value)) continue;
            if (value.__isMoveInstruction__) {
                var movedObj = this.objectAtPath(value.from);
                if (!movedObj) continue;
                result.push({from: {obj: movedObj, path: value.from}});
                value.from = movedObj;
                this.findMoveInstructions(movedObj, value.diff, result);
            } else {
                this.findMoveInstructionsInRawObject(value, result);
            }
        }
    },
    findMoveInstructions: function(obj, patch, result) {
        if (!obj || typeof obj != "object") return;
        for (var key in patch) {
            var value = patch[key];
            if (Array.isArray(value)) {
                if (value.length == 3) {
                    // defer actual moving object
                    var fromObj = this.objectAtPath(value[0]);
                    if (fromObj) {
                        result.push({from: {obj: fromObj, path: value[0]},
                                     to: {obj: obj, prop: key}});
                    }
                } else if (value.length == 1 && value[0] && Object.isObject(value[0])) {
                    this.findMoveInstructionsInRawObject(value[0], result);
                }
            } else {
                this.findMoveInstructions(obj[key], value, result);
            }
        }
    },
    removeObjectsFromOldLocations: function(moves) {
        var arraysToRepair = [];
        // apply all 'deletions' at once, starting with deepest nested object (longest path)
        moves.sort(function(left,right) { return left.from.path.length > right.from.path.length ? -1 : 1});
        for (var i = 0; i < moves.length; i++) {
            var fromPath = moves[i].from.path;
            var lastPart = fromPath.lastIndexOf('/');
            var fromParent = this.objectAtPath(fromPath.substring(0, lastPart));
            if (!fromParent) continue;
            var prop = fromPath.substring(lastPart + 1);
            delete fromParent[prop];
            if (Array.isArray(fromParent)) arraysToRepair.pushIfNotIncluded(fromParent);
        }
        // repair all arrays
        arraysToRepair.invoke('repair');
    },
    addObjectsToNewLocations: function(moves) {
        // apply all 'additions' at once
        for (var i = 0; i < moves.length; i++) {
            if (moves[i].to) { // moves without 'to' are added on-demand
                               // (this is needed for new objects which are not yet created)
                this.set(moves[i].to.obj, moves[i].to.prop, moves[i].from.obj);
            }
        }
    },
    applyMoveInstructions: function(patch) {
        var moves = [];
        this.findMoveInstructions(this.syncTable, patch, moves);
        this.removeObjectsFromOldLocations(moves);
        this.addObjectsToNewLocations(moves);
    }
},
'error handling', {
    cannotApplyPatch: function(obj, patch) {
        debugger;
        for (var key in patch) {
            if (patch.hasOwnProperty(key)) delete patch[key];
        }
        console.error("Cannot apply patch!");
    },
    cannotFindObject: function(path) {
        debugger;
        console.error("Cannot find object!");
    }
},
'updating', {
    connect: function() {
        this.socket = io.connect(null, {resource: 'nodejs/SyncServer/socket.io'});
        this.socket.on("snapshot", this.receiveSnapshot.bind(this));
        this.socket.on("patch", this.receivePatch.bind(this));
    },
    join: function(channel) {
        if (this.channel == channel) {
            if (this.snapshots) this.loadRev(Object.keys(this.snaphots).last());
        } else {
            this.channel = channel;
        }
        this.socket.emit('join', this.channel, $world.getUserName());
    },
    disconnect: function() {
        if (this.isSyncing()) this.stopSyncing();
        if (this.socket) this.socket.disconnect();
        delete this.socket;
        this.loadSnapshot(users.cschuster.sync.Snapshot.empty());
        this.rev = 0;
        console.log("disconnected");
    },
    receiveSnapshot: function(rev, snapshot) {
        console.log('received snapshot for rev ' + rev);
        if (this.onConnect) { this.onConnect(); delete this.onConnect; }
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
        this.plugins.invoke('remove', this.syncTable);
        this.syncTable = snapshot.recreateObjects();
        this.plugins.invoke('add', this.syncTable);
    },
    loadPatch: function(patch) {
        //SkipDialogs.beGlobal();
        var oldTable = Object.extend({}, this.syncTable);
        var newObjs = Object.keys(patch.data).
            select(function(v) { return Array.isArray(patch.data[v]) &&
                                        patch.data[v].length < 2 });
        var hierachicalPatch = patch.toHierachicalPatch().data;
        this.serializer = users.cschuster.sync.Snapshot.getSerializer();
        this.serializer.addPlugins([new users.cschuster.sync.RepairArraysPlugin()]);
        this.serializer.wc = this;
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
        try { //TODO: reconcile the sync plugin with the serialization plugin architecture
            this.plugins.invoke('afterPatching', this.syncTable, hierachicalPatch);
        } catch (e) { console.error(e); }
        //SkipDialogs.beNotGlobal();
    },
    loadRev: function(rev) {
        if (!this.socket) return;
        if (!rev) return;
        if (this.rev == rev) return;
        this.rev = rev;
        if (!this.snapshots || !this.snapshots[rev]) {
            this.socket.emit('checkout', this.channel, this.rev);
        } else {
            this.loadSnapshot(this.snapshots[rev]);
        }
    }
},
'syncing', {
    reset: function(obj) {
        if (this.isSyncing()) this.stopSyncing();
        if (this.socket) this.socket.emit('reset', this.channel);
    },
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
        if (this.socket) this.socket.emit('commit', this.channel, this.rev, patch);
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
    },
    autocommit: function() {
        var start = Date.now();
        try {
            this.commit();
        } finally {
            var commitTime = Date.now() - start;
            this.commitTimeout = setTimeout(
                this.autocommit.bind(this),
                Math.max(100, commitTime * 2));
        }
    },
    colorTable: {
        "0": Color.web.firebrick,
        "1": Color.web.lightcoral,
        "2": Color.web.royalblue,
        "3": Color.web.turquoise,
        "4": Color.web.forestgreen,
        "5": Color.web.darkgoldenrod,
        "6": Color.web.darkorange,
        "7": Color.web.gold,
        "8": Color.web.mediumorchid,
        "9": Color.web.lightskyblue,
        "A": Color.web.yellowgreen,
        "B": Color.web.darkseagreen,
        "C": Color.web.dimgray,
        "D": Color.web.peru,
        "E": Color.web.lightgrey,
        "F": Color.web.rosybrown
    },
    changeHand: function(activate) {
        var hand = lively.morphic.World.current().firstHand();
        if (activate) {
            jQuery('<style id="nohand" type="text/css">* {cursor: none;}</style>')
                .appendTo(jQuery("body"));
            if (!this.newHand) { hand.setNewId(); this.newHand = true; }
            var color = this.colorTable[hand.id.substring(0, 1)];
            hand.setFill(color);
            hand.setBorderColor(color.invert());
            hand.setBounds(pt(0, 0).extent(pt(6, 6)));
            hand.setBorderWidth(1);
            this.addObject(hand);
            var name = lively.morphic.World.current().getUserName();
        } else {
            jQuery("#nohand").remove();
            hand.setFill(Color.red);
            hand.setBounds(pt(0, 0).extent(pt(2, 2)));
            hand.setBorderWidth(0);
            this.removeObject(hand);
        }
    },
    startSyncing: function() {
        this.changeHand(true);
        SyncNewMorphs.beGlobal();
        SyncNewMorphs.wc = this;
        this.commitTimeout = setTimeout(this.autocommit.bind(this), 1000);
    },
    stopSyncing: function() {
        clearTimeout(this.commitTimeout);
        this.commitTimeout = null;
        SyncNewMorphs.beNotGlobal();
        this.changeHand(false);
    }
});

cop.create("SyncNewMorphs").refineObject(lively.morphic.World.current(), {
    addMorph: function(morph, optMorphBefore) {
        var result = cop.proceed(morph, optMorphBefore);
        SyncNewMorphs.wc.addObject(morph);
        return result;
    },
    removeMorph: function(morph) {
        var result = cop.proceed(morph);
        if (!morph.isHand)
            SyncNewMorphs.wc.removeObject(morph);
        return result;
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
cop.create("SkipDialogs").refineClass(lively.morphic.World, {
    openDialog: function(dialog) {
        if (dialog instanceof lively.morphic.ConfirmDialog) {
            dialog.callback(true);
        } else {
            cop.proceed(dialog);
        }
    }
}).beGlobal();

});
