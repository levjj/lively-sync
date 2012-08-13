/**
 * Shared part of syncing
 * (snapshots, diffs, patches)
 */

if (typeof exports !== 'undefined') {
  module = require('./lk').module;
}

module('users.cschuster.sync.shared').requires().toRun(function() {

Object.subclass('users.cschuster.sync.Mapping', {
    initialize: function() {
        this.rules = []; // sorted by 'from' key for fast map lookup
        this.rulesLength = 0;
    },
    addRule: function(from, to) {
        // find direct parent rule (if there is one)
        var move = this.rules
            .select(function(ea) { return from.startsWith(ea.from); })
            .max(function(ea) { return ea.from.length });
        // do not add this rule if it is just part of the parent rule
        if (move && to.startsWith(move.to)) return;
        // add rule
        var added = false;
        var fromLength = from.length;
        for (var i = 0; i < this.rules.length; i++) {
            var rule = this.rules[i];
            if (!added) {
                // add new rule at the right positon
                // (rules are sorted by length of from so that the most specific rule comes last)
                var ruleLength = rule.from.length;
                if (ruleLength > fromLength || (ruleLength == fromLength && from < rule.from)) {
                    this.rules.pushAt({from: from, to: to}, i);
                    added = true;
                }
            } else {
                // remove all mapping rules that became implicit
                if (rule.from.startsWith(from) &&
                    rule.to == to + rule.from.substring(from.length)) {
                    this.rules.removeAt(i--);
                }
            }
        }
        if (!added) this.rules.push({from: from, to: to});
        this.rulesLength = this.rules.length;
    },
    map: function(from) {
        var i = this.rulesLength;
        while (i--) {
            if (from.startsWith(this.rules[i].from)) {
                return this.rules[i].to + from.substring(this.rules[i].from.length);
            }
        }
    },
    getRules: function() {
        return this.rules;
    }
});

Object.subclass('users.cschuster.sync.Snapshot', {
    initialize: function(json) {
        if (typeof json == 'string') json = JSON.parse(json);
        this.data = json || {};
    },
    arrayDiff: function(o, n, mapping) {
        var adiff;
        for (var i = 0; i < Math.max(n.length, o.length); i++) {
            var idiff = this.jsonDiff(o[i], n[i], mapping);
            if (typeof idiff != 'undefined') {
                if (typeof adiff == 'undefined') adiff = {_t: "a"};
                adiff[i] = idiff;
            }
        }
        return adiff;
    },
    smartRefDiff: function(o, n, mapping) {
        var leftId = mapping.map(o.id) || o.id;
        var idDiff = this.jsonDiff(leftId, n.id, mapping);
        if (idDiff) return {id:[n.id]};
    },
    propDiff: function(o, n, prop, mapping){
        var pdiff;
        if (!o.hasOwnProperty(prop)) {
            pdiff = [n[prop]];
        } else if (!n.hasOwnProperty(prop)) {
            pdiff = [o[prop], 0, 0];
        } else {
            pdiff = this.jsonDiff(o[prop], n[prop], mapping);
        }
        return pdiff;
    },
    objectDiff: function(o, n, mapping) {
        if (o.__isSmartRef__ && n.__isSmartRef__) {
            return this.smartRefDiff(o, n, mapping);
        }
        var odiff;
        for (var prop in n) {
            if (n.hasOwnProperty(prop)) {
                var pdiff = this.propDiff(o, n, prop, mapping);
                if (pdiff) {
                    if (!odiff) odiff = {};
                    odiff[prop] = pdiff;
                }
            }
        }
        for (var prop in o) {
            if (o.hasOwnProperty(prop)) {
                if (!n.hasOwnProperty(prop)) {
                    var pdiff = this.propDiff(o, n, prop, mapping);
                    if (pdiff) {
                        if (!odiff) odiff = {};
                        odiff[prop] = pdiff;
                    }
                }
            }
        }
        return odiff;
    },
    jsonDiff: function(o, n, mapping){
        if (o === n) return;
        if ((o !== o) && (n !== n)) return; // both NaN
        if (o && n && typeof o == "object" && typeof n == "object") {
            return Array.isArray(n)
                ? this.arrayDiff(o, n, mapping)
                : this.objectDiff(o, n, mapping);
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
    moveMapping: function(o, n) {
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
        // aggregate moves and discard all deletes (objects not in the new snapshot)
        var mapping = new users.cschuster.sync.Mapping();
        for (var key in movesAndDeletes) {
            if (movesAndDeletes[key].to) {
                mapping.addRule(movesAndDeletes[key].from, movesAndDeletes[key].to);
            }
        }
        return mapping;
    },
    patchMoveInstructions: function(mapping) {
        var result = {};
        var toDelete = {};
        var rules = mapping.getRules();
        if (rules.length == 0) return this.data.registry;
        for (var i = 0; i < rules.length; i++) {
            var path = rules[i].from.split('/');
            var prop = [];
            do {
                prop.unshift(path.pop());
                var target = path.join('/');
            } while (!this.data.registry.hasOwnProperty(target));
            if (!toDelete[target]) toDelete[target] = [];
            toDelete[target].push(prop);
        }
        for (var key in this.data.registry) {
            var newKey = mapping.map(key) || key;
            if (toDelete.hasOwnProperty(newKey)) {
                result[newKey] = Object.clone(this.data.registry[key]);
                for (var i = 0; i < toDelete[newKey].length; i++) {
                    var target = result[newKey];
                    var path = toDelete[newKey][i];
                    for (var j = 0; j < path.length - 1; j++) {
                        var newTarget = target[path[j]].clone();
                        target[path[j]] = newTarget;
                        target = newTarget;
                    }
                    delete target[path.last()];
                }
            } else {
                result[newKey] = this.data.registry[key];
            }
        }
        return result;
    },
    diff: function(otherSnapshot) {
        var moveMapping = this.moveMapping(this.data.registry, otherSnapshot.data.registry);
        var semipatchedRegistry = this.patchMoveInstructions(moveMapping);
        // compute (remaining) raw diff
        var rawDiff = this.jsonDiff(semipatchedRegistry, otherSnapshot.data.registry, moveMapping) || {};
        // merge object diff and raw diff
        moveMapping.getRules().each(function(rule) {
            if (!rawDiff.hasOwnProperty(rule.to)) rawDiff[rule.to] = {};
            // generate move instruction
            rawDiff[rule.to] = [0, rule.from, rawDiff[rule.to], 0];
        });
        return new users.cschuster.sync.Diff({registry: rawDiff});
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
    recreateSmartRefs: function(obj, orig) {
        if (obj && typeof obj == "object" && !Array.isArray(obj)) {
            Properties.forEachOwn(obj, function(name, val) {
                var o = orig[name];
                if (o && typeof o == "object" && o.__isSmartRef__ && !Array.isArray(val)) {
                    obj[name] = [{__isSmartRef__: true, id: val.id.last()}];
                } else {
                    if (Array.isArray(val) && val.length == 4) { // move
                        val = val[2]; // continue with raw diff
                    }
                    this.recreateSmartRefs(val, o);
                }
            }, this);
        }
    },
    recreate: function(snapshot) {
        this.recreateSmartRefs(this.data.registry, snapshot.registry);
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
    findAndConvertMoveInstructions: function() {
        var mapping = new users.cschuster.sync.Mapping();
        for (var key in this.data.registry) {
            var value = this.data.registry[key];
            if (Array.isArray(value) && value.length == 4) {
                mapping.addRule(value[1], key);
                this.data.registry[key] = value[2]; // insert additional patch
            }
        }
        return mapping;
    },
    updateSmartRefs: function(obj, mapping) {
        if (!obj || typeof obj != "object") return;
        if (obj.__isSmartRef__) {
            var newId = mapping.map(obj.id);
            if (newId) obj.id = newId;
        } else {
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    this.updateSmartRefs(obj[key], mapping);
                }
            }
        }
    },
    processMoveInstructions: function(snapshot) {
        var moveMapping = this.findAndConvertMoveInstructions();
        var moves = [];
        // collect moves
        for (var key in snapshot.registry) {
            var toKey = moveMapping.map(key);
            if (toKey) moves.push({from: key, obj: snapshot.registry[key], to: toKey});
        }
        // apply all 'deletions' at once
        for (var i = 0; i < moves.length; i++) {
            delete snapshot.registry[moves[i].from]; // delete entry in registry
            var path = moves[i].from.split('/');
            var prop = [];
            do {
                prop.unshift(path.pop());
                var target = path.join('/');
            } while (!snapshot.registry.hasOwnProperty(target));
            var target = snapshot.registry[path.join('/')];
            for (var j = 0; target && j < prop.length - 1; j++) {
                target = target[prop[j]];
            }
            if (target) delete target[prop.last()]; // delete implicit smartref
        }
        // apply all 'additions' at once
        for (var i = 0; i < moves.length; i++) {
            snapshot.registry[moves[i].to] = moves[i].obj;
        }
        this.updateSmartRefs(snapshot.registry, moveMapping);
    },
    apply: function(snapshot) {
        this.processMoveInstructions(snapshot.data);
        this.prepareToPatch(snapshot.data);
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
            if (obj.length == 4) {
                // remove first value of move instruction
                // process diff part and return false
                obj.shift();
                this.coalesceDiff(obj[1], id);
                return false;
            }
            if (obj.length == 3) {
                // discard old value of delete instruction
                // and remove whole instruction if it was a
                // smartref
                return this.isSmartRef(obj.shift(), id);
            }
            // discard old value of set instruction
            if (obj.length == 2) obj.shift();
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
            // callback for operation
            if (target.length < 3) foundOperation();
            // if it is an add or set, the real target is always last element
            // if is is a move instruction then the raw diff can be found at [2]
            target = target.length < 3 ? target.last() : target[2];
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
                var instruction = this.data.registry[key];
                //if (instruction.length == 2) continue;   // set
                var op = [this.createSmartRef(key)];       // add
                if (instruction.length == 3) op.push(0,0); // delete
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
    convertToDiffInstruction: function(obj, optSnapshotObj, optSnapshot) {
        // recreates diff instructions from patch
        if (typeof obj == "object") {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 2) { // delete
                    obj.unshift(optSnapshotObj !== undefined ? optSnapshotObj : 0);
                } else if (obj.length == 3) { // move
                    obj.unshift(0);
                    this.convertToDiffInstruction(obj[2],
                        optSnapshot && optSnapshot.registry[obj[1]], optSnapshot);
                } else if (optSnapshotObj !== undefined) { // add or set
                    obj.unshift(optSnapshotObj);
                }
            } else { // path object or array
                // recursive call
                Properties.forEachOwn(obj, function(name, val) {
                    this.convertToDiffInstruction(val, optSnapshotObj[name], optSnapshot);
                }, this);
                // adding _t back if this is an array
                var isntArray = Properties.own(obj).find(function(name) {
                    return isNaN(name);
                });
                if (!Object.isEmpty(obj) && !isntArray) obj._t = "a";
            }
        }
    },
    toDiff: function() {
        var raw = {registry:{}};
        for (var key in this.data) {
            raw.registry[key] = this.data[key];
        }
        return new users.cschuster.sync.Diff(raw);
    },
    apply: function(snapshot) {
        var diff = this.toDiff(snapshot);
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
                        val = removeAdds(val);
                    } else { // move
                        current = current[1];
                    }
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
