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

Function.prototype.addMethods = function(source) {
	for (var property in source) {
		if (property == 'constructor') continue;
		var value = source[property];
		this.prototype[property] = value;
        if (typeof value == 'function') {
			value.declaredClass = this.prototype.constructor.type;
			value.methodName = property;
		}
		return this;
	}
};

Function.prototype.subclass = function(className, sourceObj) {
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
};

exports.module = function() {
    return {
        requires: function() {
            return {
                toRun: function(cb){ cb(); }
            }
        }
    }
};
