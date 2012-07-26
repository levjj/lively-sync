/**
 * Server part of syncing
 * (socket.io, postgresql)
 */

var io = require('socket.io').listen(8114);
var EventEmitter = require('events').EventEmitter;
var Seq = require('seq');
var pg = require('pg');
var module = require('./lk').module;
require('./shared');

var CONNECTION_STRING = "tcp://syncproto:steam@localhost/syncproto";
var DIFFS_PER_SNAPSHOT = 20;
var DEMO = 'demo';

module('users.cschuster.sync.server').requires('users.cschuster.sync.shared').toRun(function() {

Object.subclass('users.cschuster.sync.Mutex', {
    initialize: function() {
        this.queue = new EventEmitter();
        this.locked = false;
    },
    lock: function (fn) {
        if (this.locked) {
            this.queue.once('ready', function () {
                this.lock(fn);
            }.bind(this));
        } else {
            this.locked = true;
            fn();
        }
    },
    release: function () {
        this.locked = false;
        this.queue.emit('ready');
    }
});

Object.subclass('users.cschuster.sync.Repository', {
    mutex: new users.cschuster.sync.Mutex(),
    
    initialize: function(exclusive, cb) {
        if ('undefined' == typeof cb) { cb = exclusive; exclusive = false; }
        pg.connect(CONNECTION_STRING, function(err, db) {
            if (err) return console.error(err);
            this.db = db;
            if (exclusive) return this.mutex.lock(cb.bind(this, this));
            cb(this);
        }.bind(this));
    },
    
    release: function() {
        this.mutex.release();
    },
    
    checkout: function(rev, cb) {
        this.latestSnapshotRevBefore(rev, function(from) {
            this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev >= $2 AND rev <= $3", [DEMO, from, rev], function(err, result) {
                if (err) return console.error(err);
                if (result.rows.length < 1) return console.error("checkout: no revision between " + from + " and " + rev);
                if (result.rows[0].type != "snapshot") return console.error("checkout: expected rev " + from + " to be a snapshot");
                var snapshot = new users.cschuster.sync.Snapshot(result.rows[0].data);
                for (var i = 1; i < result.rows.length; i++) {
                    if (result.rows[i].type != "diff") return console.error("checkout: expected rev " + from + " to be a diff");
                    snapshot.patch(new users.cschuster.sync.Patch(result.rows[i].data));
                }
                cb(snapshot);
            });
        }.bind(this));
    },
    
    _computedPatchToSnapshot: function(fromRev, toSnapshot, cb) {
        this.checkout(fromRev, function(fromSnapshot) {
            var diff = fromSnapshot.diff(toSnapshot);
            if (diff) cb(diff.toPatch());
        });
    },
    
    _storedPatch: function(fromRev, toRev, cb) {
        this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev = $2", [DEMO, rev], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("stored patch: expected one result");
            var data = JSON.parse(results.row[0].data);
            if (result.rows[0].type == "snapshot") {
                this._computedPatchToSnapshot(fromRev, data, cb);
            } else {
                cb(new users.cschuster.sync.Patch(data));
            }
        }.bind(this));
    },
    
    _computedPatch: function(fromRev, toRev, cb) {
        this.checkout(toRev, function(toSnapshot) {
            this._computedDiffToSnapshot(fromRev, toSnapshot, cb);
        }.bind(this));
    },
    
    patch: function(fromRev, toRev, cb) {
        if (toRev - fromRev == 1) {
            this._storedPatch(fromRev, toRev, cb);
        } else {
            this._computedPatch(fromRev, toRev, cb);
        }
    },
    
    head: function(cb) {
        this.db.query("SELECT MAX(rev) AS head FROM history WHERE obj = $1", [DEMO], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("head: expected one result");
            cb(result.rows[0].head);
        });
    },
    
    latestSnapshotRevBefore: function(rev, cb) {
        this.db.query("SELECT MAX(rev) AS latest FROM history WHERE obj = $1 AND type = 'snapshot' AND rev <= $2", [DEMO, rev], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("latest snapshot: expected one result");
            cb(result.rows[0].latest);
        });
    },
    
    _createSnapshot: function(head, patch) {
        this.checkout(head, function(snapshot) {
            snapshot.patch(patch);
            console.log("creating snapshot for revision " + (head + 1));
            this.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "snapshot", snapshot.toJSON()]);
        }.bind(this));
    },
    
    commit: function(head, patch) {
        this.latestSnapshotRevBefore(head, function(latest) {
            if (head - latest > DIFFS_PER_SNAPSHOT) {
                this._createSnapshot(head, patch);
            } else {
                console.log("creating patch for revision " + (head + 1));
                this.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "patch", patch.toJSON()]);
            }
        }.bind(this));
    },
    
    reset: function() {
        this.db.query("DELETE FROM history WHERE rev > 1");
    }
});


Object.subclass('users.cschuster.sync.Server', {
    initialize: function(socket) {
        this.socket = socket;
        this.socket.on('checkout', this.checkout.bind(this));
        this.socket.on('update', this.update.bind(this));
        this.socket.on('commit', this.commitPatch.bind(this));
    },
    
    withRepo: function(exclusive, cb) {
        new users.cschuster.sync.Repository(exclusive, function(repo) {
            cb(repo);
        }.bind(this));
    },
    
    checkout: function (rev) {
        console.log("checking out rev " + rev);
        this.withRepo(false, function(repo) {
            repo.checkout(rev, this.socket.emit.bind(this.socket, 'snapshot', rev));
        }.bind(this));
    },
    
    update: function (fromRev) {
        console.log("requested update from rev " + fromRev);
        this.withRepo(false, function(repo) {
            repo.head(function (head) {
                if (!fromRev || (fromRev < head - DIFFS_PER_SNAPSHOT)) {
                    repo.checkout(
                        head,
                        this.socket.emit.bind(this.socket, 'snapshot', head));
                } else {
                    repo.diff(
                        fromRev,
                        head,
                        this.socket.emit.bind(this.socket, 'patch', head));
                }
            }.bind(this));
        }.bind(this));
    },
    
    commitSnapshot: function (oldRev, snapshot) {
        console.log("commiting from rev " + oldRev);
        this.withRepo(true, function(repo) {
            repo.head(function (head) {
                this.socket.broadcast.emit('snapshot', head + 1, snapshot);
                repo.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "snapshot", snapshot], function() {
                    repo.release();
                });
            }.bind(this));
        }.bind(this));
    },
    
    commitPatch: function (oldRev, patch) {
        this.withRepo(true, function(repo) {
            repo.head(function (head) {
                if (oldRev == head) {
                    repo.commit(head, new users.cschuster.sync.Patch(patch));
                    this.socket.broadcast.emit('patch', head + 1, patch);
                } else {
                    //FIXME: Implement conflcit resolution (3way diff, merging, etc.)
                    //TODO: diff3 not implemented yet in jsondiffpatch
                    console.error("received outdated patch");
                    /*Seq([oldRev, head])
                    .parMap(function (rev) {
                        repo.checkout(rev, this.bind(this, null));
                    })
                    .seq(function (old, mine) {
                        var yours = xdiff.patch(old, patch);
                        var newPatch = xdiff.diff3(mine, yours, old);
                        if (newPatch) {
                            repo.commit(head, newPatch);
                            this.socket.broadcast.emit('patch', head + 1, newPatch);
                        }
                        var myPatch = xdiff.diff(yours, mine);
                        if (myPatch) {
                            this.socket.emit('patch', head + 1, myPatch);
                        }
                    }.bind(this));*/
                }
            }.bind(this));
        }.bind(this));
    }
});

new users.cschuster.sync.Repository(function(repo) {
    repo.reset(); // delete old data
});

io.set('log level', 1);
io.sockets.on('connection', function (socket) {
    new users.cschuster.sync.Server(socket);
});

});
