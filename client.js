/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared').toRun(function() {

Object.subclass('users.cschuster.sync.Plugin', {
    addedObj: function(obj) {},
    updatedObj: function(obj, prop, val) {},
    removedObj: function(obj) {}
});

users.cschuster.sync.Plugin.subclass('users.cschuster.sync.MorphPlugin', {
    addedObj: function(morph) {
        morph.openInWorld();
    },
    updatedObj: function(morph, prop, val) {
        var setter = morph['set' + prop.capitalize()];
        if (Object.isFunction(setter)) {
            setter.call(morph, val);
        } else {
            morph[prop] = val;
        }
    },
    removedObj: function(morph) {
        morph.remove();
    }
});

Object.subclass('users.cschuster.sync.WorkingCopy',
    'initializing', {
        initialize: function(keepHistory) {
            this.plugins = [];
            this.rev = 0;
            this.syncTable = {};
            if (keepHistory) {
                this.snapshots = {};
                this.patches = {};
            }
            this.loadSocketIO();
        },
        loadSocketIO: function() {
            if (!Global['io']) {
                var head = document.getElementsByTagName('head')[0];
                var socketscript = document.createElement('script');
                socketscript.type = 'text/javascript';
                socketscript.src =
                    'http://lively-kernel.org/nodejs/SyncServer/socket.io/socket.io.js';
                head.appendChild(socketscript);
            }
        },
        addPlugin: function(plugin) {
            this.plugins.push(plugin);
        }
    },
    'updating', {
        connect: function() {
            this.socket = io.connect(null, {resource: 'nodejs/SyncServer/socket.io'});
            this.socket.on("snapshot", this.receiveSnapshot.bind(this));
            this.socket.on("patch", this.receivePatch.bind(this));
            if (this.maxRevision() > 0) this.loadRev(this.maxRevision());
            (function(){this.socket.emit('update', this.rev)}).bind(this).delay(1);
            console.log("connected");
        },
        disconnect: function() {
            this.socket.disconnect();
            delete this.socket;
            //FIXME: this does not work for all kinds of objects
            Object.values(this.syncTable).invoke('remove');
            this.syncTable = {};
            this.rev = 0;
            console.log("disconnected");
        },
        receiveSnapshot: function(rev, snapshot) {
            var oldMax = this.maxRevision();
            this.snapshots[rev] = new users.cschuster.sync.Snapshot(snapshot);
            console.log('received snapshot for rev ' + rev);
            if (this.rev == oldMax) {
                this.rev = rev;
                this.loadSnapshot(this.snapshots[rev]);
            } else {
                signal(this, "rev", this.rev);
            }
        },
        receivePatch: function(rev, patch) {
            throw Error('diff/patches not implemented yet');
            if (this.rev !== rev + 1) {
                console.warn("received patch for rev " + rev + " but local rev is " + this.rev);
                this.socket.emit('update', this.rev);
            } else {
                this.rev = rev;
                jsondiffpatch.patch(this.morphSyncTable, patch);
            }
        },
        loadSnapshot: function(snapshot) {
            Properties.forEachOwn(this.syncTable, function(key, val) {
                this.plugins.invoke('removedObj', val);
                this.removeObject(val);
            }, this);
            var objects = snapshot.recreateObjects();
            Properties.forEachOwn(objects, function(key, val) {
                this.addObj(val);
                this.plugins.invoke('addedObj', val);
            }, this);
        },
        loadRev: function(rev) {
            if (!this.socket) return;
            if (this.rev == rev) return;
            this.rev = rev;
            if (!this.snapshots[rev]) {
                this.socket.emit('checkout', this.rev);
            } else {
                this.loadSnapshot(this.snapshots[rev]);
            }
        },
        maxRevision: function() {
            var max = 0;
            for (var rev in this.snapshots) {
                if ((+rev) > max) max = (+rev);
            }
            return max;
        }
    },
    'syncing', {
        addObject: function(obj) {
            this.syncTable[obj.id] = obj;
        },
        removeObject: function(obj) {
            delete this.syncTable[obj.id];
        },


        commit: function() {
            var current = new users.cschuster.sync.Snapshot();
            current.createFromObjects(this.syncTable);
            var last = this.snapshots[this.rev];
            var diff = current.diff(last);
            if (!diff) return;
            var patch = diff.toPatch();
            //TODO: send patches instead of snapshots
            this.socket.emit('commit', this.rev, current);
            if (this.snapshots) {
                this.snapshots[this.rev + 1] = current;
                this.patches[this.rev + 1] = patch;
            }
            this.rev++;
            console.log('commited snapshot for rev ' + this.rev);
        }    }
);

users.cschuster.sync.Snapshot.addMethods({
    getSerializer: function(data) {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        serializer.addPlugins(lively.persistence.getPluginsForLively());
        var p = new GenericFilter();
        p.addFilter(function(obj, prop, value) {
            return obj.isScript && prop == "currentTimeout";
        });
        serializer.addPlugins([p]);
        serializer.showLog = false;
        return serializer;
    },
    createFromObjects: function(object) {
        var serializer = this.getSerializer();
        this.data = serializer.serializeToJso(object);
        return this;
    },
    recreateObjects: function() {
        this.getSerializer().deserializeJso(this.data);
    }
});

users.cschuster.sync.Patch.addMethods({
    applyToMorphs: function(morphs) {
        return true;
    }
});

cop.create("HierachicalIds").refineClass(lively.persistence.ObjectGraphLinearizer, {
    newId: function() {
        var id = this.path.join('/');
        while (this.registry[id]) id = "#" + id;
        return id;
    }
}).beGlobal();

});
