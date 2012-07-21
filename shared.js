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
    isSmartRef: function(obj, id) {
        if (!obj) return false;
        if (!Object.isObject(obj)) return false;
        if (!obj.__isSmartRef__) return false;
        return obj.id == id;
    },
    removeSmartRefs: function(obj, id) {
        // discards smartrefs
        // returns true if smartref can be removed, but
        // do not coalesce this part of the diff
        if (!obj || !Object.isObject(obj)) return false; // primitive
        if (this.isSmartRef(obj, id)) { // smartref
            return true;
        }
        // object or array
        Properties.forEachOwn(obj, function(key, value) {
            if (this.removeSmartRefs(value, id + "/" + key)) {
                delete obj[key];
            }
        }, this);
        // always keep empty objects and arrays in raw mode
        return false;
    },
    coalesceDiff: function(obj, id) {
        // discards smartrefs
        // returns true if that part of the diff is empty
        // after removing the smartrefs.
        if (Array.isArray(obj)) { // instruction
            if (obj.length == 3) {
                // discard old value of delete instruction
                // and remove whole instruction if it was a
                // smartref
                return this.isSmartRef(obj.splice(0,1)[0], id);
             }
            // discard old value of set instruction
            if (obj.length == 2) obj.splice(0,1);
            // if the added or modified value is a smartref, remove it
            if (this.isSmartRef(obj[0], id)) return true;
            // else recursively remove smartref (and copy this
            // part of the tree as not to manipulate the snapshot)
            obj[0] = Object.deepCopy(obj[0]);
            this.removeSmartRefs(obj[0], id);
            // but keep the instruction itself
            return false;
        }
        // object or array
        delete obj._t;
        Properties.forEachOwn(obj, function(key, value) {
            if (this.coalesceDiff(value, id + "/" + key)) {
                delete obj[key];
            }
        }, this);
        // remove this part of the diff if there are no children
        return Object.isEmpty(obj);
    },
    toPatch: function() {
        var patch = new users.cschuster.sync.Patch();
        var toDelete = this.aggregateDeletions();
        for (var id in this.data.registry) {
            if (id && !id.startsWith("#")
                   && !toDelete.any(function(s) {return id.startsWith(s+"/")})) {
                var obj = this.data.registry[id];
                if (!this.coalesceDiff(obj, id)) {
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
                    if (Array.isArray(registry[parent])) {
                        // there is already an add or set instruction
                        // so just append our raw data
                        registry[parent].last()[thisKey] = op.last();
                    } else {
                        if (!registry.hasOwnProperty(parent)) {
                            registry[parent] = {};
                        }
                        registry[parent][thisKey] = op;
                    }
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
    isEmpty: function() {
        return !this.data || Object.isEmpty(this.data);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

});
