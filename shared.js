/**
 * Shared part of syncing
 * (snapshots, diffs, patches)
 */

if (typeof exports !== 'undefined') {
  module = require('./lk').module;
  jsondiffpatch = require('jsondiffpatch');
}

module('users.cschuster.sync.shared').requires('users.cschuster.sync.jsondiffpatch').toRun(function() {

Object.subclass('users.cschuster.sync.Snapshot', {
    initialize: function(json) {
        if (typeof json == 'string') json = JSON.parse(json);
        this.data = json || {};
    },
    diff: function(otherSnapshot) {
        var rawDiff = jsondiffpatch.diff(this.data, otherSnapshot.data);
        if (!rawDiff || !rawDiff.registry) return null;
        return new users.cschuster.sync.Diff(rawDiff);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

Object.subclass('users.cschuster.sync.Diff', {
    initialize: function(json) {
        if (typeof json == 'string') json = JSON.parse(json);
        this.data = json || {};
    },
    reverse: function() {
        jsondiffpatch.reverse(this.data);
    },
    apply: function(snapshot) {
        jsondiffpatch.patch(snapshot.data, this.data);
    },
    aggregateDeletions: function() {
        var toDelete = [];
        Properties.forEachOwn(this.data.registry, function(key, value) {
            if (Array.isArray(value) && value.length == 3) {
                for (var i = 0; i < toDelete.length; i++) {
                    if (key.startsWith(toDelete[i])) {
                        return;
                    }
                    if (toDelete[i].startsWith(key)) {
                        toDelete.removeAt(i--);
                    }
                }
                toDelete.push(key);
            }
        });
        return toDelete;
    },
    convertToForwardPatch: function(obj, optObj) {
        if (optObj) obj = optObj;
        // discards data for reverse patching
        if (Object.isObject(obj)) {
            if (Array.isArray(obj)) { // instruction
                if (obj.length !== 1) {
                    obj.splice(0, 1);
                }
            } else { // raw object or array
                Properties.forEachOwn(obj, this.convertToForwardPatch, this)
            }
        }
    },
    removeSmartRefs: function(obj, id, rawMode) {
        // discards smartrefs
        // returns true if that part of the diff is empty
        // after removing the smartrefs.
        if (!obj || !Object.isObject(obj)) return false; // primitive
        if (Object.isObject(obj) && obj.__isSmartRef__ && obj.id == id) { // smartref
            return true;
        }
        if (!rawMode && Array.isArray(obj)) { // instruction
            switch(obj.length) {
                case 1: return this.removeSmartRefs(obj[0], id, true); //add
                case 2: return this.removeSmartRefs(obj[1], id, true); //set
                case 3: return this.removeSmartRefs(obj[0], id, true); //del
            }
        }
        // object or array
        delete obj._t;
        Properties.forEachOwn(obj, function(key, value) {
            var subId = id + "/" + key;
            if (this.removeSmartRefs(value, id + "/" + key, rawMode)) {
                delete obj[key];
            }
        }, this);
        // always keep empty objects and arrays in raw mode
        return Object.isEmpty(obj) && !rawMode;
    },
    toPatch: function() {
        var patch = new users.cschuster.sync.Patch();
        var toDelete = this.aggregateDeletions();
        for (var id in this.data.registry) {
            if (id && !id.startsWith("#")
                   && !toDelete.any(function(s) {return id.startsWith(s+"/")})) {
                var obj = this.data.registry[id];
                if (!this.removeSmartRefs(obj, id, false)) {
                    this.convertToForwardPatch(obj);
                    patch.data[id] = obj;
                }
            }
        }
        return patch;
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

Object.subclass('users.cschuster.sync.Patch', {
    initialize: function(json) {
        if (typeof json == 'string') json = JSON.parse(json);
        this.data = json || {};
    },
    createSmartRef: function(id) {
        return {__isSmartRef__: true, id: id};
    },
    convertToDiffInstruction: function(obj, optSnapshotObj) {
        // recreates diff instructions from patch
        if (Object.isObject(obj)) {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 2) {
                    obj.unshift(optSnapshotObj !== undefined ? optSnapshotObj : 0);
                } else if (optSnapshotObj !== undefined) {
                    obj.unshift(optSnapshotObj);
                }
            } else { // raw object or array
                Properties.forEachOwn(obj, function(name, val) {
                    this.convertToDiffInstruction(val, optSnapshotObj[name]);
                }, this)
            }
        }
    },
    toDiff: function(optSnapshot) {
        var raw = {registry:{}};
        for (var key in this.data) {
            var diffVal = this.data[key];
            var origVal = optSnapshot && optSnapshot.data.registry[key];
            raw.registry[key] = diffVal ;
            this.convertToDiffInstruction(diffVal, origVal);
        }
        return new users.cschuster.sync.Diff(raw);
    },
    addMissingSmartRefs: function(registry) {
        for (var key in registry) {
            if (Array.isArray(registry[key]) && key.indexOf('/')) {
                var op = [this.createSmartRef(key)];
                if (registry[key].length == 2) continue;
                if (registry[key].length == 3) op.push(0,0);
                var parent = key.substring(0, key.lastIndexOf('/'));
                var thisKey = key.substring(key.lastIndexOf('/') + 1);
                if (!isNaN(thisKey) && parent.indexOf('/')) {
                    var oldKey = thisKey;
                    thisKey = parent.substring(parent.lastIndexOf('/') + 1);
                    parent = parent.substring(0, parent.lastIndexOf('/'));
                    if (!registry.hasOwnProperty(parent)) {
                        registry[parent] = {};
                    }
                    if (!registry[parent].hasOwnProperty(thisKey)) {
                        registry[parent][thisKey] = {_t:"a"};
                    }
                    registry[parent][thisKey][oldKey] = op;
                } else {
                    if (!registry.hasOwnProperty(parent)) {
                        registry[parent] = {};
                    }
                    registry[parent][thisKey] = op;
                }
            }
        }
    },
    propagateDeletions: function(diff, snapshot) {
        var toDelete = diff.aggregateDeletions();
        for (var id in snapshot.data.registry) {
            if (toDelete.any(function(s) {return id.startsWith(s)})) {
                var op = [snapshot.data.registry[id], 0, 0];
                diff.data.registry[id] = op;
            }
        }
    },
    apply: function(snapshot) {
        var diff = this.toDiff(snapshot);
        this.addMissingSmartRefs(diff.data.registry);
        this.propagateDeletions(diff, snapshot);
        diff.apply(snapshot);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

});
