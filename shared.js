/**
 * Shared part of syncing
 * (snapshots, diffs, patches)
 */

if (typeof exports !== 'undefined') {
  module = require('./lk').module;
}

module('users.cschuster.sync.shared').requires().toRun(function() {

Object.subclass('users.cschuster.sync.Snapshot', {
    initialize: function(json) {
        if (typeof json == 'string') json = JSON.parse(json);
        this.data = json || {};
    },
    arrayDiff: function(o, n) {
        var adiff;
        for (var i = 0; i < Math.max(n.length, o.length); i++) {
            var idiff = this.jsonDiff(o[i], n[i]);
            if (typeof idiff != 'undefined') {
                if (typeof adiff == 'undefined') adiff = {_t: "a"};
                adiff[i] = idiff;
            }
        }
        return adiff;
    },
    objectDiff: function(o, n){
        var odiff;
        var addPropDiff = function(prop){
            var pdiff;
            if (!o.hasOwnProperty(prop)) {
                pdiff = [n[prop]];
            } else if (!n.hasOwnProperty(prop)) {
                pdiff = [o[prop], 0, 0];
            } else {
                pdiff = this.jsonDiff(o[prop], n[prop]);
            }
            if (typeof pdiff != 'undefined') {
                if (typeof odiff == 'undefined') {
                    odiff = {};
                }
                odiff[prop] = pdiff;
            }
        }.bind(this);
        for (var prop in n) {
            if (n.hasOwnProperty(prop)) {
                addPropDiff(prop);
            }
        }
        for (var prop in o) {
            if (o.hasOwnProperty(prop)) {
                if (typeof n[prop] == 'undefined') {
                    addPropDiff(prop);
                }
            }
        }
        return odiff;
    },
    jsonDiff: function(o, n){
        if (o === n) return;
        if ((o !== o) && (n !== n)) return; // both NaN
        if (o && n && typeof o == "object" && typeof n == "object") {
            return Array.isArray(n) ? this.arrayDiff(o, n): this.objectDiff(o, n);
        } else {
            var d = [];
            if (typeof o != 'undefined') {
                if (typeof n != 'undefined') {
                    d.push(o, n); // old value changed to new value
                } else {
                    d.push(o, 0, 0); // old value has been removed
                }
            } else {
                d.push(n); // new value is added
            }
            return d;
        }
    },
    copyDiff: function(o, n) {
        var movesAndDeletes = {};
        // find all objects with ids that were moved or deleted
        for (var key in o) {
            if (o[key].id && (!n.hasOwnProperty(key) || o[key].id != n[key].id)) {
                movesAndDeletes[o[key].id] = {from: key};
            }
        }
        // add the new key if they were moved
        for (var key in n) {
            if (n[key].id && movesAndDeletes[n[key].id]) {
                movesAndDeletes[n[key].id].to = key;
            }
        }
        // discard all objects not in the new snapshot
        var result = [];
        for (var key in movesAndDeletes) {
            if (movesAndDeletes[key].to) {
                // find direct parent copy (if there is one)
                var move = result
                    .select(function(ea) { return key.startsWith(ea.from); })
                    .max(function(ea) { return ea.from.length });
                // do not add this copy if it is just part of the parent copy
                if (move && movesAndDeletes[key].to.startsWith(move.to))
                    result.push(movesAndDeletes[key]);
            }
        }
        return result;
    },
    diff: function(otherSnapshot) {
        var copyDiff = this.copyDiff(this.data.registry, otherSnapshot.data.registry);
        // apply the copy diff
        var semiPatchedData = {id:"", registry: Object.clone(this.data.registry)};
        for (var key in this.data.registry) {
            // find direct parent copy for each entry in this snapshot
            var move = copyDiff
                .select(function(ea) { return key.startsWith(ea.from); })
                .max(function(ea) { return ea.from.length });
            // if there is one, perform the copy
            if (move) {
                var toKey = move.to + key.substring(move.from.length);
                semiPatchedData.registry[toKey] = this.data.registry[key];
            }
        }
        // compute (remaining) raw diff
        var rawDiff = this.jsonDiff(semiPatchedData, otherSnapshot.data);
        // merge object diff and raw diff
        for (var i = 0; i < copyDiff.length; i++) {
            var from = copyDiff[i].from, to = copyDiff[i].to;
            if (!rawDiff.registry.hasOwnProperty(to)) rawDiff.registry[to] = {};
            // generate copy instruction
            rawDiff.registry[to] = [0, from, rawDiff.registry[to], 0];
        }
        return new users.cschuster.sync.Diff(rawDiff);
    },
    toJSON: function() {
        return JSON.stringify(this.data);
    },
    clone: function() {
        return new users.cschuster.sync.Snapshot(Object.deepCopy(this.data));
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
    applyPatch: function(o, pname, d) {
        if (typeof d !== 'object') return o;
        if (Array.isArray(d)) { // changed value
            if (d.length < 3) {
                var nvalue = d.last();
                if (pname !== null) {
                    o[pname] = nvalue;
                }
                return nvalue;
            }
            else { // undefined, delete value
                delete o[pname];
            }
        } else { // path to changes value
            var target = pname === null ? o : o[pname];
            if (d._t == 'a') { // array diff
                if (typeof target != 'object' || !Array.isArray(target)) {
                    throw new Error('cannot apply patch: array expected');
                }
                for (var p in d) {
                    if (p !== '_t' && d.hasOwnProperty(p)) {
                        this.applyPatch(target, p, d[p]);
                    }
                }
                target.repair();
            } else { // object diff
                if (typeof target != 'object' || Array.isArray(target)) {
                    throw new Error('cannot apply patch: object expected');
                }
                for (var p in d) {
                    if (d.hasOwnProperty(p)) {
                        this.applyPatch(target, p, d[p]);
                    }
                }
            }
        }
        return o;
    },
    findAndRemoveCopyDiffs: function() {
        var result = [];
        for (var key in this.data.registry) {
            var value = this.data.registry[key];
            if (Array.isArray(value) && value.length == 4) {
                result.push({from:value[1], to: key});
                this.data.registry[key] = value[2]; // insert additional patch
            }
        }
        return result;
    },
    processCopyInstructions: function(snapshot) {
        var copies = this.findAndRemoveCopyDiffs();
        for (var key in snapshot.registry) {
            // find direct parent copy for each entry in this snapshot
            var move = copies
                .select(function(ea) { return key.startsWith(ea.from); })
                .max(function(ea) { return ea.from.length });
            // if there is one, perform the copy
            if (move) {
                var toKey = move.to + key.substring(move.from.length);
                snapshot.registry[toKey] = snapshot.registry[key];
            }
        }
    },
    apply: function(snapshot) {
        this.processCopyInstructions(snapshot.data);
        this.applyPatch(snapshot.data, null, this.data);
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
        return typeof id == "undefined" || obj.id == id;
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
            if (obj.length >= 3) {
                // discard old value of delete instruction
                // and remove whole instruction if it was a
                // smartref
                // if this was a copy instruction, simply
                // remove first value and return false
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
        if (target.hasOwnProperty(prop)) return;
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
            } else {
                if (target[arrayName].hasOwnProperty(index)) return;
            }
            target[arrayName][index] = op.last();
        } else {
            var subtarget = this.findInObjOrAdd(
                target, arrayName, function() { op = op.last(); });
            if (subtarget.hasOwnProperty(index)) return;
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
                if (this.data.registry[key].length == 2) continue;
                var op = [this.createSmartRef(key)];
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
    prepareToPatch: function(snapshot) {
        this.addMissingClassNames(this.data);
        this.addMissingSmartRefs();
        this.propagateDeletions(snapshot);
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
                if (obj.length == 2) { // delete
                    obj.unshift(optSnapshotObj !== undefined ? optSnapshotObj : 0);
                } else if (obj.length == 3) { // copy
                    obj.unshift(0);
                } else if (optSnapshotObj !== undefined) { // add or set
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
        var diff = new users.cschuster.sync.Diff(raw);
        if (optSnapshot) diff.prepareToPatch(optSnapshot);
        return diff;
    },
    apply: function(snapshot) {
        this.recreate(snapshot);
        var diff = this.toDiff(snapshot);
        diff.apply(snapshot);
    },
    isEmpty: function() {
        return !this.data || Object.isEmpty(this.data);
    },
    recreateSmartRefs: function(obj, orig) {
        if (obj && typeof obj == "object" && !Array.isArray(obj)) {
            Properties.forEachOwn(obj, function(name, val) {
                var o = orig[name];
                if (o && typeof o == "object" && o.__isSmartRef__ && !Array.isArray(val)) {
                    obj[name] = [{__isSmartRef__: true, id: val.id.last()}];
                } else {
                    this.recreateSmartRefs(val, o);
                }
            }, this);
        }
    },
    recreate: function(snapshot) {
        this.recreateSmartRefs(this.data, snapshot.data.registry);
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
            var prop = parts.last();
            if (!current.hasOwnProperty(prop) || current[prop].id == key)
                current[prop] = val;
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
