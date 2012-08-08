/**
 * Shared part of syncing
 * (snapshots, diffs, patches)
 */

if (typeof exports !== 'undefined') {
  module = require('./lk').module;
  jsondiffpatch = require('./jsondiffpatch');
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

Object.extend(users.cschuster.sync.Snapshot, {
    empty: function() {
        return new this({id: "", registry: {
            "": {__LivelyClassName__: undefined},
            "isSimplifiedRegistry": true}});
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
        function addDel(key) {
            for (var i = 0; i < toDelete.length; i++) {
                if (key.startsWith(toDelete[i])) return;
                if (toDelete[i].startsWith(key)) {
                    toDelete.removeAt(i--);
                }
            }
            toDelete.push(key);
        }
        Properties.forEachOwn(this.data.registry, function(key, value) {
            if (Array.isArray(value)) {
                if (value.length == 3) addDel(key + "/"); // delete instruction
            } else {
                Properties.forEachOwn(value, function(subk, subv) {
                    // Settting a previously implicit smartref to
                    // something else is also treated as a delete instruction
                    if (Array.isArray(subv) && subv.length == 2 &&
                        this.isSmartRef(subv[0], key + "/" + subk) &&
                        !this.isSmartRef(subv[1], key + "/" + subk)) {
                        addDel(key + "/" + subk);
                    }
                }, this);
            }
        }, this);
        return toDelete;
    },
    isSmartRef: function(obj, id) {
        if (!obj) return false;
        if (typeof obj != "object") return false;
        if (!obj.__isSmartRef__) return false;
        return obj.id == id;
    },
    removeSmartRefs: function(obj, id) {
        // discards smartrefs
        // returns true if smartref can be removed, but
        // do not coalesce this part of the diff
        if (!obj || typeof obj != "object") return false; // primitive
        if (this.isSmartRef(obj, id)) { // smartref
            return true;
        }
        // object or array
        var delCount = 0;
        Properties.forEachOwn(obj, function(key, value) {
            if (this.removeSmartRefs(value, id + "/" + key)) {
                if (Array.isArray(obj)) {
                    delCount++;
                } else {
                    delete obj[key];
                }
            }
        }, this);
        if (Array.isArray(obj) && delCount == obj.length) {
            obj.clear();
        }
        if (obj.__LivelyClassName__ === undefined)
            delete obj.__LivelyClassName__;
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
            if (id && !toDelete.some(function(s) {return id.startsWith(s)})) {
                var obj = this.data.registry[id];
                if (!this.coalesceDiff(obj, id)) {
                    patch.data[id] = obj;
                }
            }
        }
        return patch;
    },
    createSmartRef: function(id) {
        return {__isSmartRef__: true, id: id};
    },
    findInObjOrAdd: function(obj, prop, foundOperation) {
        var target = obj[prop];
        if (!target) { // target not in diff, add empty object
            target = obj[prop] = {};
        } else if (Array.isArray(target)) { // instruction
            // can only be add or set, so real target is always last element
            target = target.last();
            // callback for operation
            foundOperation();
        }
        return target;
    },
    addMissingSmartRefObj: function(path, prop, op) {
        var target = this.findInObjOrAdd(
            this.data.registry,
            path,
            function() { op = op.last(); });
        target[prop] = op;
    },
    addMissingSmartRefArray: function(path, arrayName, index, op) {
        var addObjOp = false;
        var target = this.findInObjOrAdd(
            this.data.registry,
            path,
            function() { addObjOp = true;});
        if (addObjOp) {
            if (!target.hasOwnProperty(arrayName)) {
                target[arrayName] = [];
            }
            target[arrayName][index] = op.last();
        } else {
            var subtarget = this.findInObjOrAdd(
                target, arrayName, function() { op = op.last(); });
            subtarget._t = "a";
            subtarget[index] = op;
        }
    },
    addMissingSmartRef: function(key, op) {
        var path = key.split('/');
        if (!isNaN(path.last())) {
            var index = path.pop();
            var arrayName = path.pop();
            this.addMissingSmartRefArray(path.join('/'), arrayName, index, op);
        } else {
            var prop = path.pop();
            this.addMissingSmartRefObj(path.join('/'), prop, op);
        }
    },
    addMissingSmartRefs: function() {
        for (var key in this.data.registry) {
            if (Array.isArray(this.data.registry[key])) {
                var op = [this.createSmartRef(key)];
                if (this.data.registry[key].length == 2) continue;
                if (this.data.registry[key].length == 3) op.push(0,0);
                this.addMissingSmartRef(key, op);
            }
        }
    },
    addMissingClassNames: function(obj) {
        if (typeof obj == "object") {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 3) return;
                var o = obj.last();
                if (o && typeof o == "object" &&
                    !o.hasOwnProperty("__isSmartRef__") &&
                    !o.hasOwnProperty("__LivelyClassName__")) {
                    o.__LivelyClassName__ = undefined;
                }
            } else { // raw object or array
                Properties.forEachOwn(obj, function(name, val) {
                    this.addMissingClassNames(val);
                }, this)
            }
        }
    },
    propagateDeletions: function(snapshot) {
        var toDelete = this.aggregateDeletions();
        for (var id in snapshot.data.registry) {
            if (toDelete.some(function(s) {return id.startsWith(s)})) {
                var op = [snapshot.data.registry[id], 0, 0];
                this.data.registry[id] = op;
            }
        }
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
    convertToDiffInstruction: function(obj, optSnapshotObj) {
        // recreates diff instructions from patch
        if (typeof obj == "object") {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 2) {
                    obj.unshift(optSnapshotObj !== undefined ? optSnapshotObj : 0);
                } else if (optSnapshotObj !== undefined) {
                    obj.unshift(optSnapshotObj);
                }
            } else { // path object or array
                // recursive call
                Properties.forEachOwn(obj, function(name, val) {
                    this.convertToDiffInstruction(val, optSnapshotObj[name]);
                }, this);
                // adding _t back if this is an array
                var isntArray = Properties.own(obj).find(function(name) {
                    return isNaN(name);
                });
                if (!isntArray) obj._t = "a";
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
    apply: function(snapshot) {
        var diff = this.toDiff(snapshot);
        diff.addMissingClassNames(diff.data);
        diff.addMissingSmartRefs();
        diff.propagateDeletions(snapshot);
        diff.recreateSmartRefUpdates(snapshot);
        diff.apply(snapshot);
    },
    isEmpty: function() {
        return !this.data || Object.isEmpty(this.data);
    },
    toHierachicalPatch: function() {
        var newPatch = {};
        function removeAdds(obj) {
            if (!obj || typeof obj != 'object') return obj;
            if (Array.isArray(obj) && obj.length == 1) return obj[0];
            for (var key in obj) {
                obj[key] = removeAdds(obj[key]);
            }
            return obj;
        }
        for (var key in this.data) {
            var val = this.data[key];
            var parts = key.split('/');
            var current = newPatch;
            var rawMode = false;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
                if (!rawMode && Array.isArray(current)) {
                    rawMode = true;
                    current = current[0];
                    val = removeAdds(val);
                }
            }
            current[parts.last()] = val;
        }
        return new users.cschuster.sync.Patch(newPatch);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    },
    clone: function() {
        return new users.cschuster.sync.Patch(Object.deepCopy(this.data));
    }
});

});
