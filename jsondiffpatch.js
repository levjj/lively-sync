if (typeof exports !== 'undefined') {
  module = require('./lk').module;
}
module('users.cschuster.sync.jsondiffpatch').requires().toRun(function() {

/**
 *   Json Diff Patch
 *   ---------------
 *   https://github.com/benjamine/JsonDiffPatch
 *   by Benjamin Eidelman - beneidel@gmail.com
 */
(function(){

    var jdp = {};
    if (typeof jsondiffpatch != 'undefined'){
        jdp = jsondiffpatch;
    }

    jdp.dateReviver = function(key, value){
        var a;
        if (typeof value === 'string') {
            a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)(Z|([+\-])(\d{2}):(\d{2}))$/.exec(value);
            if (a) {
                return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]));
            }
        }
        return value;
    }

    var isArray = (typeof Array.isArray == 'function') ?
        // use native function
        Array.isArray :
        // use instanceof operator
        function(a) {
            return typeof a == 'object' && a instanceof Array;
        };

    var isDate = function(d){
        return d instanceof Date || Object.prototype.toString.call(d) === '[object Date]';
    };

    var arrayDiff = function(o, n){
        var adiff, i, idiff, nl = n.length, ol = o.length, addItemDiff;
        
        addItemDiff = function(index){
            idiff = diff(o[index], n[index]);
            if (typeof idiff != 'undefined') {
                if (typeof adiff == 'undefined') {
                    adiff = {
                        _t: 'a'
                    };
                }
                adiff[index] = idiff;
            }
        };
        
        for (i = 0; i < Math.max(nl, ol); i++) {
            addItemDiff(i);
        }
        return adiff;
    };
    
    var objectDiff = function(o, n){
    
        var odiff, pdiff, prop, addPropDiff;
        
        addPropDiff = function(name){
            if (!o.hasOwnProperty(prop)) {
                pdiff = [n[prop]];
            } else if (!n.hasOwnProperty(prop)) {
                pdiff = [o[prop], 0, 0];
            } else {
                pdiff = diff(o[prop], n[prop]);
            }
            if (typeof pdiff != 'undefined') {
                if (typeof odiff == 'undefined') {
                    odiff = {};
                }
                odiff[prop] = pdiff;
            }
        };
        
        for (prop in n) {
            if (n.hasOwnProperty(prop)) {
                addPropDiff(prop);
            }
        }
        for (prop in o) {
            if (o.hasOwnProperty(prop)) {
                if (typeof n[prop] == 'undefined') {
                    addPropDiff(prop);
                }
            }
        }
        return odiff;
    };
    
    var diff = jdp.diff = function(o, n){
        var ntype, otype, nnull, onull, d;
        
        if (o === n) {
            return;
        }
        ntype = typeof n;
        otype = typeof o;
        nnull = n === null;
        onull = o === null;
        
        if ((o !== o) && (n !== n)) {
            return;
        }

        // handle Date objects
        if (otype == 'object' && isDate(o)){
            otype = 'date';
        }
        if (ntype == 'object' && isDate(n)){
            ntype = 'date';
            if (otype == 'date'){
                // check if equal dates
                if (o.getTime() === n.getTime()){
                    return;
                }
            }
        }
        
        if (nnull || onull || ntype == 'undefined' || ntype != otype ||
        ntype == 'number' ||
        otype == 'number' ||
        ntype == 'boolean' ||
        otype == 'boolean' ||
        ntype == 'string' ||
        otype == 'string' ||
        ntype == 'date' ||
        otype == 'date' ||
        ((ntype === 'object') && (isArray(n) != isArray(o)))) {
            // value changed
            d = [];
            if (typeof o != 'undefined') {
                if (typeof n != 'undefined') {
                    // old value changed to new value
                    d.push(o, n);
                }
                else {
                    // old value has been removed
                    d.push(o, 0, 0);
                }
            }
            else {
                // new value is added
                d.push(n);
            }
            return d;
        }
        else {
            if (isArray(n)) {
                // diff 2 arrays	
                return arrayDiff(o, n);
            }
            else {
                // diff 2 objects
                return objectDiff(o, n);
            }
        }
    };
    
    var reverse = jdp.reverse = function(d){
        var prop, rd;
        if (typeof d == 'undefined') {
            return;
        } else if (d === null) {
            return null;
        } else if (typeof d == 'object' && !isDate(d)) {
            if (isArray(d)){
                if (d.length < 3) {
                    if (d.length == 1) {
                        // add => delete
                        return [d[0], 0, 0];
                    } else {
                        // modify => reverse modify
                        return [d[1], d[0]];
                    }
                }
                else {
                    // undefined, delete value => add value
                    return [d[0]];
                }
            }else {
                rd = {};
                for (prop in d) {
                    if (d.hasOwnProperty(prop)) {
                        rd[prop] = reverse(d[prop]);
                    }
                }
                return rd;
            }
        }
        return d;
    }
    
    var patch = jdp.patch = function(o, pname, d, path) {
    
        var p, nvalue, subpath = '', target;
        
        if (typeof pname != 'string') {
            path = d;
            d = pname;
            pname = null;
        }
        else {
            if (typeof o != 'object') {
                pname = null;
            }
        }
        
        if (path) {
            subpath += path;
        }
        subpath += '/';
        if (pname !== null) {
            subpath += pname;
        }
        
        
        if (typeof d == 'object') {
            if (isArray(d)) {
                // changed value
                if (d.length < 3) {
                    nvalue = d[d.length - 1];
                    if (pname !== null) {
                        o[pname] = nvalue;
                    }
                    return nvalue;
                }
                else {
                    // undefined, delete value
                    delete o[pname];
                }
            }
            else {
                if (d._t == 'a') {
                    // array diff
                    target = pname === null ? o : o[pname];
                    if (typeof target != 'object' || !isArray(target)) {
                        throw new Error('cannot apply patch at "' + subpath + '": array expected');
                    }
                    else {
                        for (p in d) {
                            if (p !== '_t' && d.hasOwnProperty(p)) {
                                patch(target, p, d[p], subpath);
                            }
                        }
                    }
                    target.repair();
                }
                else {
                    // object diff
                    target = pname === null ? o : o[pname];
                    if (typeof target != 'object' || isArray(target)) {
                        throw new Error('cannot apply patch at "' + subpath + '": object expected');
                    }
                    else {
                        for (p in d) {
                            if (d.hasOwnProperty(p)) {
                                patch(target, p, d[p], subpath);
                            }
                        }
                    }
                }
            }
        }
        
        return o;
    }

    var unpatch = jdp.unpatch = function(o, pname, d, path){
        
        if (typeof pname != 'string') {
            return patch(o, reverse(pname), d);
        }

        return patch(o, pname, reverse(d), path);
    }
    
    if (typeof require === 'function' && typeof exports === 'object') {
        // CommonJS, eg: node.js
        exports = jdp;
    } else if (typeof define === 'function' && define['amd']) {
        // AMD
        define(jdp);
    } else {
        // browser global
        window.jsondiffpatch = jdp;
    }

})();

});