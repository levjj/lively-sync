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
        toPatch: function() {
            var patch = new users.cschsuter.sync.Patch();
        
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
