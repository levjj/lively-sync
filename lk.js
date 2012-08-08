/**
 * Micro-Lively Kernel Class System
 * (no inheritence, no categories, no dependencies)
 */

var Global = (function() { return this; })();

var Class = {
    initializerTemplate: (function CLASS(){ this.initialize.apply(this, arguments) }).toString(),
    newInitializer: function(name) {
        // this hack ensures that class instances have a name
        return eval(Class.initializerTemplate.replace(/CLASS/g, name) + ";" + name);
    },
    isValidIdentifier: function(str) {
        return (/^(?:[a-zA-Z_][\w\-]*[.])*[a-zA-Z_][\w\-]*$/).test(str);
    },
    unqualifiedNameFor: function Class$unqualifiedNameFor(name) {
        var lastDot = name.lastIndexOf('.'); // lastDot may be -1
        var unqualifiedName = name.substring(lastDot + 1);
        if (!Class.isValidIdentifier(unqualifiedName)) {
            throw new Error('not a name ' + unqualifiedName);
        }
        return unqualifiedName;
    },
    namespaceFor: function Class$namespaceFor(className) {
        var context = Global;
        var parts = className.split('.');
        for (i = 0; i < parts.length - 1; i++) {
            var part = parts[i];
            if (!Class.isValidIdentifier(part)) {
                throw new Error('"'+part+'" is not a valid name for a package.');
            }
            context[part] = context[part] || {};
            context = context[part];
        }
        return context;
    }
};

Object.extend = function (destination, source) {
    for (var property in source) {
        var sourceObj = source[property];
        destination[property] = sourceObj;
        if (sourceObj instanceof Function) sourceObj.displayName = property;
    }
    return destination;
};

Object.extend(Function.prototype, {
    addMethods: function(source) {
        for (var property in source) {
            if (property == 'constructor') continue;
            var value = source[property];
            this.prototype[property] = value;
            if (typeof value == 'function') {
                value.declaredClass = this.prototype.constructor.type;
                value.methodName = property;
            }
        }
        return this;
    },
    subclass: function(className, sourceObj) {
        targetScope = Class.namespaceFor(className);
        shortName = Class.unqualifiedNameFor(className);
        var klass;
        klass = Class.newInitializer(shortName);
        klass.superclass = this;
        var protoclass = function() { }; // that's the constructor of the new prototype object
        protoclass.prototype = this.prototype;
        klass.prototype = new protoclass();
        klass.prototype.constructor = klass;
        klass.prototype.constructor.type = className; // KP: .name would be better but js ignores .name on anonymous functions
        targetScope[shortName] = klass;
        this.addMethods.call(klass, sourceObj);
        if (!klass.prototype.initialize)
            klass.prototype.initialize = protoclass;
        return klass;
    }
});

Object.extend(Array.prototype, {
    find: function(iterator, context) {
        for (var value, i = 0, len = this.length; i < len; i++) {
            value = this[i];
            if (iterator.call(context, value, i)) return value;
        }
        return undefined;
    },
    last: function() {
        return this[this.length - 1];
    },
    repair: function () {
        // fix gaps that were created with 'delete'
        var i = 0, j = 0, len = this.length;
        while (i < len) {
            if (this.hasOwnProperty(i)) {
                this[j++] = this[i];
            }
            i++;
        }
        while (j++ < len) this.pop();
    }
});

Object.extend(String.prototype, {
    startsWith: function(pattern) {
        return this.indexOf(pattern) === 0;
    }
});

Object.extend(Object, {
    isEmpty: function(object) {
        for (var key in object)
            if (object.hasOwnProperty(key)) return false;
        return true;
    },
});

Object.subclass('Properties');
Object.extend(Properties, {
    own: function(object) {
        var a = [];
        for (var name in object) {
            if (object.hasOwnProperty(name) && typeof object[name] != 'function') {
                a.push(name);
            }
        }
        return a;
    },
    forEachOwn: function(object, func, context) {
        for (var name in object) {
            if (!object.hasOwnProperty(name)) continue;
            var value = object[name];
            if (typeof value != 'function') {
                func.call(context || this, name, value);
            }
        }
    }
});

exports.module = function() {
    return {
        requires: function() {
            return {
                toRun: function(cb){ cb(); }
            }
        }
    }
};
