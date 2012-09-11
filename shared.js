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
            .max(function(ea) { return ea.from.length; });
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
                    this.rules.splice(i, 0, {from: from, to: to});
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
                if (typeof adiff == 'undefined') adiff = {};
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
                    if (o == null) return; //FIXME: special case for null->undefined
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
        // aggregate moves (and deletes)
        var mapping = new users.cschuster.sync.Mapping();
        for (var key in movesAndDeletes) {
            var to = movesAndDeletes[key].to;
            if (to) {
                mapping.addRule(movesAndDeletes[key].from, to);
            } else {
                mapping.addRule(movesAndDeletes[key].from, movesAndDeletes[key].from);
            }
        }
        return mapping;
    },
    patchMoveInstructions: function(mapping) {
        var result = {};
        // get move mapping
        var rules = mapping.getRules();
        if (rules.length == 0) return this.data.registry;
        // implicit smartrefs pointing to the origin of a
        // move  instruction need to get deleted
        // so collect these smartrefs in a data structure like this:
        //   {X: [["a"], ["b","1"]]}
        //   (which means to delete X.a and X.b.1)
        var toDelete = {};
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
        // now map all entries in the current registry to the new registry
        var arraysToRepair = [];
        for (var key in this.data.registry) {
            var newKey = mapping.map(key);
            if (newKey == key) continue; // do nothing for moves without targets (i.e. deletes)
            if (!newKey) newKey = key;
            // move instruction have priority over normal copying
            // e.g. if you have the mapping X -> Y and this snapshot is [X.Y]
            //      then the result would be [Y] with Y being the moved X
            if (newKey == key && result.hasOwnProperty(key)) continue;
            if (toDelete.hasOwnProperty(key)) {
                // if a smartref of the current registry entry needs to
                // be deleted, clone the object as not to manipulate
                // this snapshot
                result[newKey] = Object.clone(this.data.registry[key]);
                for (var i = 0; i < toDelete[key].length; i++) {
                    var target = result[newKey];
                    var path = toDelete[key][i];
                    // walk the path of to the property
                    for (var j = 0; j < path.length - 1; j++) {
                        var newTarget = target[path[j]].clone();
                        target[path[j]] = newTarget;
                        target = newTarget;
                    }
                    delete target[path.last()];
                    // array elements can be deleted using the normal
                    // delete operation with the last part of the path being the index
                    // but afterwards these manipulated arrays need to get repaired
                    // so that there is no missmatch between length and array elements
                    if (Array.isArray(target)) arraysToRepair.pushIfNotIncluded(target);
                }
            } else {
                result[newKey] = this.data.registry[key];
            }
        }
        return [result, arraysToRepair];
    },
    diff: function(otherSnapshot) {
        var moveMapping = this.moveMapping(this.data.registry, otherSnapshot.data.registry);
        var semipatchedRegistry = this.patchMoveInstructions(moveMapping)[0];
        // compute (remaining) raw diff
        var rawDiff = this.jsonDiff(semipatchedRegistry, otherSnapshot.data.registry, moveMapping) || {};
        // merge object diff and raw diff
        moveMapping.getRules().each(function(rule) {
            if (rule.from == rule.to) { // moves with no target (i.e. deletes)
                if (rawDiff.hasOwnProperty(rule.to)) return; // do nothing
                rawDiff[rule.to] = [this.data.registry[rule.from], 0,0];
            } else {  // normal moves
                if (!rawDiff.hasOwnProperty(rule.to) || Array.isArray(rawDiff[rule.to])) {
                    rawDiff[rule.to] = {};
                }
                // generate move instruction
                rawDiff[rule.to] = [0, rule.from, rawDiff[rule.to], 0];
            }
        }.bind(this));
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
    findMoveInstructions: function(snapshot) {
        var mapping = new users.cschuster.sync.Mapping();
        for (var key in this.data.registry) {
            var value = this.data.registry[key];
            if (Array.isArray(value)) {
                if (value.length == 1 && value[0].id) { // replace an object instead of patching it
                    var oldId = snapshot.data.registry[key] && snapshot.data.registry[key].id;
                    if (!oldId || value[0].id == oldId) continue;
                    mapping.addRule(key, key);
                } else if (value.length == 3) { // move
                    mapping.addRule(value[0], key);
                }
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
        var moveMapping = this.findMoveInstructions(snapshot);
        var patchResult = snapshot.patchMoveInstructions(moveMapping);
        snapshot.data.registry = patchResult[0];
        this.updateSmartRefs(snapshot.data.registry, moveMapping);
        return patchResult[1];
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
    convertToDiffInstruction: function(obj, snapshotObj) {
        // recreates diff instructions from patch
        if (typeof obj == "object") {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 3) { // move
                    obj.unshift(0);
                    this.convertToDiffInstruction(obj[2], snapshotObj);
                } else if (obj.length == 2) { // delete
                    obj.unshift(snapshotObj !== undefined ? snapshotObj : 0);
                } else if (snapshotObj !== undefined) { // add or set
                    obj.unshift(snapshotObj);
                }
            } else { // path object or array
                // recursive call
                Properties.forEachOwn(obj, function(name, val) {
                    this.convertToDiffInstruction(val, snapshotObj[name]);
                }, this);
            }
        }
    },
    createSmartRef: function(id) {
        return {__isSmartRef__: true, id: id};
    },
    recreateSmartRefs: function(obj, orig) {
        if (obj && typeof obj == "object" && !Array.isArray(obj)) {
            Properties.forEachOwn(obj, function(name, val) {
                var o = orig[name];
                if (o && typeof o == "object" && o.__isSmartRef__ && !Array.isArray(val)) {
                    obj[name] = [this.createSmartRef(val.id.last())];
                } else {
                    if (Array.isArray(val) && val.length == 4) { // move
                        val = val[2]; // continue with raw diff
                    }
                    this.recreateSmartRefs(val, o);
                }
            }, this);
        }
    },



    addMissingSmartRef: function(key, op, registry) {
        var path = key.split('/'), targetKey;
        var propChain = [];
        do {
            propChain.unshift(path.pop());
            targetKey = path.join('/');
        } while (!registry[targetKey] && !this.data.registry[targetKey]);
        var target = this.data.registry;
        propChain.unshift(targetKey);
        var rawMode = false;
        for (var j = 0; j < propChain.length - 1; j++) {
            var prop = propChain[j];
            if (!target[prop]) target[prop] = {};
            target = target[prop];
            if (!rawMode && Array.isArray(target)) {
                if (target.length == 1) { // add
                    rawMode = true;
                    target = target[0];
                } else if (target.length == 3) { // remove
                    return;
                } else if (target.length == 4) { // move
                    target = target[2];
                }
            }
        }
        var prop = propChain.last();
        if (!target.hasOwnProperty(prop) || target[prop].id == key ||
            (Array.isArray(target[prop].id) && target[prop].id[0] == key)) {
            target[prop] = rawMode && op.length == 1 ? op[0] : op;
        }
    },
    addMissingSmartRefs: function(snapshot) {
        for (var key in this.data.registry) {
            if (Array.isArray(this.data.registry[key])) {
                var instruction = this.data.registry[key];
                //if (instruction.length == 2) continue;   // set
                var op = [this.createSmartRef(key)];       // add
                if (instruction.length == 3) op.push(0,0); // delete
                this.addMissingSmartRef(key, op, snapshot.registry);
            }
        }
    },
    addMissingClassNames: function(obj) {
        if (typeof obj == "object") {
            if (Array.isArray(obj)) { // instruction
                if (obj.length == 4) return this.addMissingClassNames(obj[2]);
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
        for (var id in snapshot.registry) {
            if (toDelete.some(function(s) {return id.startsWith(s)})) {
                var op = [snapshot.registry[id], 0, 0];
                this.data.registry[id] = op;
            }
        }
    },
    prepareToPatch: function(snapshot) {
        this.convertToDiffInstruction(this.data.registry, snapshot.registry);
        this.recreateSmartRefs(this.data.registry, snapshot.registry);
        this.addMissingClassNames(this.data);
        this.addMissingSmartRefs(snapshot);
        this.propagateDeletions(snapshot);
    },
    applyPatch: function(o, pname, d) {
        if (typeof d !== 'object') return o;
        if (Array.isArray(d)) { // changed value
            if (d.length == 4) { // move
                this.applyPatch(o, pname, d[2]);
            } else if (d.length == 3) { // delete
                delete o[pname];
            } else { // add or set
                var nvalue = d.last();
                if (pname !== null) {
                    o[pname] = nvalue;
                }
                return nvalue;
            }
        } else { // path to changes value
            var target = pname === null ? o : o[pname];
            if (typeof target != 'object') {
                throw new Error('cannot apply patch: object expected');
            }
            for (var p in d) {
                if (d.hasOwnProperty(p)) {
                    this.applyPatch(target, p, d[p]);
                }
            }
            if (Array.isArray(target)) target.repair();
        }
        return o;
    },
    apply: function(snapshot) {
        var arraysToRepair = this.processMoveInstructions(snapshot);
        this.prepareToPatch(snapshot.data);
        this.applyPatch(snapshot.data, null, this.data);
        //for (var i = 0; i < arraysToRepair.length; i++) arraysToRepair[i].repair();
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
    toJSON: function() {
        return JSON.stringify(this.data);
    },
    clone: function() {
        return new users.cschuster.sync.Patch(Object.deepCopy(this.data));
    }
});

});
