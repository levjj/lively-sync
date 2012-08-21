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
var DIFFS_PER_SNAPSHOT = 100;

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
    mutex: {},
    
    initialize: function(channel, exclusive, cb) {
        this.channel = channel;
        pg.connect(CONNECTION_STRING, function(err, db) {
            if (err) return console.error(err);
            this.db = db;
            if (exclusive) {
                if (!this.mutex[channel]) this.mutex[channel] = new users.cschuster.sync.Mutex();
                return this.mutex[channel].lock(cb.bind(this, this));
            }
            cb(this);
        }.bind(this));
    },
    
    release: function() {
        this.mutex[this.channel].release();
    },
    
    initial: function(cb) {
        this.db.query("SELECT data FROM history WHERE obj = $1 AND rev = $2", ["demo", 1], function(err, result) {
            var snapshot = new users.cschuster.sync.Snapshot(result.rows[0].data);
            this._createSnapshot(1, snapshot, function() { cb(snapshot); });
        }.bind(this));
    },
    
    checkout: function(rev, cb) {
        this.latestSnapshotRevBefore(rev, function(from) {
            this.db.query("SELECT rev, type, data FROM history WHERE obj = $1 AND rev >= $2 AND rev <= $3 ORDER BY rev", [this.channel, from, rev], function(err, result) {
                try {
                if (err) return console.error(err);
                if (result.rows.length < 1) return console.error("checkout: no revision between " + from + " and " + rev);
                if (result.rows[0].type != "snapshot") return console.error("checkout: expected rev " + from + " to be a snapshot");
                var snapshot = new users.cschuster.sync.Snapshot(result.rows[0].data);
                for (var i = 1; i < result.rows.length; i++) {
                    if (result.rows[i].type != "patch") return console.error("checkout: expected rev " + from + " to be a diff");
                    var patch = new users.cschuster.sync.Patch(result.rows[i].data);
                    patch.apply(snapshot);
                }
                cb(snapshot);
                } catch (e) { console.error(e); console.error(e.stack); console.error("rev="+result.rows[i].rev+" patch="+result.rows[i].data); }
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
        this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev = $2", [this.channel, rev], function(err, result) {
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
        this.db.query("SELECT MAX(rev) AS head FROM history WHERE obj = $1", [this.channel], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("head: expected one result");
            cb(result.rows[0].head);
        });
    },
    
    latestSnapshotRevBefore: function(rev, cb) {
        this.db.query("SELECT MAX(rev) AS latest FROM history WHERE obj = $1 AND type = 'snapshot' AND rev <= $2", [this.channel, rev], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("latest snapshot: expected one result");
            cb(result.rows[0].latest);
        });
    },
    
    _createSnapshot: function(rev, snapshot, cb) {
        console.log("creating snapshot for revision " + rev);
        this.db.query("INSERT INTO history(obj, rev, type, data, username) VALUES($1, $2, $3, $4, $5)",
                      [this.channel, rev, "snapshot", snapshot.toJSON(), this.username],
                      cb);
    },
    
    _createPatch: function(rev, patch, cb) {
        console.log("creating patch for revision " + rev);
        this.db.query("INSERT INTO history(obj, rev, type, data, username) VALUES($1, $2, $3, $4, $5)",
                      [this.channel, rev, "patch", patch.toJSON(), this.username],
                      cb);
    },
    
    commit: function(head, patch, cb) {
        this.latestSnapshotRevBefore(head, function(latest) {
            if (head - latest > DIFFS_PER_SNAPSHOT) {
                this.checkout(head, function(snapshot) {
                    patch.apply(snapshot);
                    this._createSnapshot(head + 1, snapshot, cb);
                }.bind(this));
            } else {
                this._createPatch(head + 1, patch, cb);
            }
        }.bind(this));
    },
    
    reset: function(cb) {
        this.db.query("DELETE FROM history WHERE obj = $1 AND rev > 1", [this.channel], cb);
    }
});


Object.subclass('users.cschuster.sync.Server', {
    initialize: function(socket) {
        this.socket = socket;
        this.username = 'anonymous';
        this.socket.on('checkout', this.checkout.bind(this));
        this.socket.on('update', this.update.bind(this));
        this.socket.on('join', this.join.bind(this));
        this.socket.on('reset', this.reset.bind(this));
        this.socket.on('commit', this.commit.bind(this));
    },
    
    withRepo: function(channel, exclusive, cb) {
        new users.cschuster.sync.Repository(channel, exclusive, function(repo) {
            repo.username = this.username;
            cb(repo);
        }.bind(this));
    },
    
    checkout: function(channel, rev) {
        console.log("checking out rev " + rev);
        this.withRepo(false, function(repo) {
            repo.checkout(rev, function(snapshot) {
                this.socket.emit('snapshot', rev, snapshot.data);
            }.bind(this));
        }.bind(this));
    },
    
    update: function(channel, fromRev) {
        console.log("requested update from rev " + fromRev);
        this.withRepo(channel, false, function(repo) {
            repo.head(function (head) {
                if (!fromRev || fromRev != head) {
                    repo.checkout(head, function(snapshot) {
                        this.socket.emit('snapshot', head, snapshot.data);
                    }.bind(this));
                }
            }.bind(this));
        }.bind(this));
    },
    
    join: function(channel, username) {
        console.log(username + " joins channel " + channel);
        this.username = username || 'anonymous';
        this.withRepo(channel, true, function(repo) {
            repo.head(function (head) {
                var success = function(snapshot) {
                    this.socket.emit('snapshot', head, snapshot.data);
                    this.socket.join(channel);
                    this.socket.broadcast.to(channel).emit('joined', this.username);
                    repo.release();
                }.bind(this);
                if (!head) {
                    repo.initial(success);
                } else {
                    repo.checkout(head, success);
                }
            }.bind(this));
        }.bind(this));
    },
    
    reset: function(channel) {
        console.log("resetting channel " + channel);
        this.withRepo(channel, true, function(repo) {
            repo.reset(function() {
                repo.checkout(1, function(snapshot) {
                    this.socket.emit('snapshot', 1, snapshot.data);
                    this.socket.broadcast.to(channel).emit('snapshot', 1, snapshot.data);
                    repo.release();
                }.bind(this));
            }.bind(this));
        }.bind(this));
    },
    
    commit: function(channel, oldRev, patch) {
        this.withRepo(channel, true, function(repo) {
            repo.head(function (head) {
                if (oldRev == head) {
                    this.socket.broadcast.to(channel).emit('patch', head + 1, patch);
                    repo.commit(head, new users.cschuster.sync.Patch(patch), function() {
                        repo.release();
                    });
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

io.set('log level', 1);
io.set('transports', ['htmlfile', 'xhr-polling', 'jsonp-polling']);
io.sockets.on('connection', function(socket) {
    new users.cschuster.sync.Server(socket);
});

});
