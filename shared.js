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
    removeSmartRefs: function(obj, rawMode) {
        // discards SmartRefs
        if (Object.isObject(obj)) {
            if (obj.__isSmartRef__) return true;
            if (!rawMode && Array.isArray(obj)) { // instruction
                if (obj.length === 1) {
                    if (this.removeSmartRefs(obj[0], true)) {
                        return true;
                    }
                }
            } else { // raw object or array
                Properties.forEachOwn(obj, function(key, value) {
                    if (Object.isObject(value) &&
                        value.__isSmartRef__ ||
                        this.removeSmartRefs(value, rawMode)) {
                        delete obj[key];
                    }
                }, this)
                if (Object.isEmpty(obj)) return true;
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
                if (!this.removeSmartRefs(obj)) {
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
    apply: function(snapshot) {
        var diff = this.toDiff();
        diff.apply(snapshot);
    },
    toDiff: function() {
        var raw = {};
        // ...
        return new users.cschuster.sync.Diff(raw);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    }
});

});
