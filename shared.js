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
                for (var i = 0; i < toDelete.length; i++)
                    if (toDelete[i].startsWith(key))
                        toDelete.removeAt(i--);
                toDelete.push(key + "/");
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
                delete obj._t;
                Properties.forEachOwn(obj, this.convertToForwardPatch, this)
            }
        }
    },
    removeSmartRefs: function(obj, rawMode, id) {
        // discards SmartRefs
        if (Object.isObject(obj)) {
            if (!rawMode && Array.isArray(obj)) { // instruction
                if (obj.length === 1) {
                    if (this.removeSmartRefs(obj[0], true, id)) {
                        return true;
                    }
                }
            } else { // raw object or array
                Properties.forEachOwn(obj, function(key, value) {
                    var subId = id + "/" + key;
                    var isForwardRef =
                        Object.isObject(value) &&
                        value.__isSmartRef__ &&
                        value.id == subId;
                    if (isForwardRef || this.removeSmartRefs(value, rawMode, subId)) {
                        delete obj[key];
                    }
                }, this)
                if (Object.isEmpty(obj) && !rawMode) {
                    // always keep empty objects and arrays in raw mode
                    return true;
                }
            }
        }
        return false;
    },
    toPatch: function() {
        var patch = new users.cschuster.sync.Patch();
        var toDelete = this.aggregateDeletions();
        for (var id in this.data.registry) {
            if (id && !id.startsWith("#")
                   && !toDelete.any(function(s) {return id.startsWith(s)})) {
                var obj = this.data.registry[id];
                this.convertToForwardPatch(obj);
                if (!this.removeSmartRefs(obj, false, id)) {
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
    toDiff: function() {
        var morphs = {};
        var raw = {id:"",registry:{isSimplifiedRegistry: true,"":morphs}};
        for (var key in this.data) {
            raw.registry[key] = this.data[key];
            morphs[key] = this.createSmartRef(key);
        }
        return new users.cschuster.sync.Diff(raw);
    },
    apply: function(snapshot) {
        var diff = this.toDiff();
        diff.apply(snapshot);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

});
