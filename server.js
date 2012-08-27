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
            this.queue.once('ready', this.lock.bind(this, fn));
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
        console.error("DEBUG: initialize");
        this.channel = channel;
        var doConnect = function() {
            pg.connect(CONNECTION_STRING, function(err, db) {
                if (err) return this.handleError(err);
                this.db = db;
                cb(this);
            }.bind(this));
        }.bind(this);
        if (exclusive) {
            if (!this.mutex[channel]) this.mutex[channel] = new users.cschuster.sync.Mutex();
            return this.mutex[channel].lock(doConnect);
        } else {
            doConnect();
        }
    },
    
    handleError: function(err) {
        console.error(err);
        if (err instanceof Error) console.error(err.stack);
        this.release();
        return null;
    },
    
    release: function() {
        console.error("DEBUG: release");
        if (!this.channel) return;
        var mutex = this.mutex[this.channel];
        if (mutex && mutex.locked) mutex.release();
    },
    
    initial: function(cb) {
        console.error("DEBUG: initial");
        this.db.query("SELECT data FROM history WHERE obj = $1 AND rev = $2", ["demo", 1], function(err, result) {
            var snapshot = users.cschuster.sync.Snapshot.empty();
            this._createSnapshot(1, snapshot, function() { cb(snapshot); });
        }.bind(this));
    },
    
    checkout: function(rev, cb) {
        console.error("DEBUG: checkout");
        this.latestSnapshotRevBefore(rev, function(from) {
            console.error("DEBUG: checkout > 1");
            this.db.query("SELECT rev, type, data FROM history WHERE obj = $1 AND rev >= $2 AND rev <= $3 ORDER BY rev", [this.channel, from, rev], function(err, result) {
                console.error("DEBUG: checkout > 2");
                try {
                    if (err) return this.handleError(err);
                    console.error("DEBUG: checkout > 3");
                    if (result.rows.length < 1) return this.handleError("checkout: no revision between " + from + " and " + rev);
                    console.error("DEBUG: checkout > 4");
                    if (result.rows[0].type != "snapshot") return this.handleError("checkout: expected rev " + from + " to be a snapshot");
                    console.error("DEBUG: checkout > 5");
                    var snapshot = new users.cschuster.sync.Snapshot(result.rows[0].data);
                    console.error("DEBUG: checkout > 6");
                    for (var i = 1; i < result.rows.length; i++) {
                        console.error("DEBUG: checkout > 7a");
                        if (result.rows[i].type != "patch") return this.handleError("checkout: expected rev " + from + " to be a diff");
                        console.error("DEBUG: checkout > 7b");
                        var patch = new users.cschuster.sync.Patch(result.rows[i].data);
                        console.error("DEBUG: checkout > 7c");
                        patch.apply(snapshot);
                    }
                    console.error("DEBUG: checkout > 8");
                    cb(snapshot);
                    console.error("DEBUG: checkout > 9");
                } catch (e) {
                    console.error("DEBUG: checkout > E");
                    return this.handleError(e);
                }
            });
        }.bind(this));
    },
    
    _computedPatchToSnapshot: function(fromRev, toSnapshot, cb) {
        console.error("DEBUG: _computedPatchToSnapshot");
        this.checkout(fromRev, function(fromSnapshot) {
            var diff = fromSnapshot.diff(toSnapshot);
            if (diff) cb(diff.toPatch());
        });
    },
    
    _storedPatch: function(fromRev, toRev, cb) {
        console.error("DEBUG: _storedPatch");
        this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev = $2", [this.channel, rev], function(err, result) {
            if (err) return this.handleError(err);
            if (result.rows.length != 1) return this.handleError("stored patch: expected one result");
            var data = JSON.parse(results.row[0].data);
            if (result.rows[0].type == "snapshot") {
                this._computedPatchToSnapshot(fromRev, data, cb);
            } else {
                cb(new users.cschuster.sync.Patch(data));
            }
        }.bind(this));
    },
    
    _computedPatch: function(fromRev, toRev, cb) {
        console.error("DEBUG: _computedPatch");
        this.checkout(toRev, function(toSnapshot) {
            this._computedDiffToSnapshot(fromRev, toSnapshot, cb);
        }.bind(this));
    },
    
    patch: function(fromRev, toRev, cb) {
        console.error("DEBUG: patch");
        if (toRev - fromRev == 1) {
            this._storedPatch(fromRev, toRev, cb);
        } else {
            this._computedPatch(fromRev, toRev, cb);
        }
    },
    
    head: function(cb) {
        console.error("DEBUG: head");
        this.db.query("SELECT MAX(rev) AS head FROM history WHERE obj = $1", [this.channel], function(err, result) {
            if (err) return this.handleError(err);
            if (result.rows.length != 1) return this.handleError("head: expected one result");
            cb(result.rows[0].head);
        });
    },
    
    latestSnapshotRevBefore: function(rev, cb) {
        console.error("DEBUG: latestSnapshotRevBefore");
        this.db.query("SELECT MAX(rev) AS latest FROM history WHERE obj = $1 AND type = 'snapshot' AND rev <= $2", [this.channel, rev], function(err, result) {
            if (err) return this.handleError(err);
            if (result.rows.length != 1) return this.handleError("latest snapshot: expected one result");
            cb(result.rows[0].latest);
        });
    },
    
    _createSnapshot: function(rev, snapshot, cb) {
        console.error("DEBUG: _createSnapshot");
        console.log("creating snapshot for revision " + rev);
        this.db.query("INSERT INTO history(obj, rev, type, data, username) VALUES($1, $2, $3, $4, $5)",
                      [this.channel, rev, "snapshot", snapshot.toJSON(), this.username],
                      function (err, result) { if (err) return this.handleError(err); cb(result); }.bind(this));
    },
    
    _createPatch: function(rev, patch, cb) {
        console.error("DEBUG: _createPatch");
        console.log("creating patch for revision " + rev);
        this.db.query("INSERT INTO history(obj, rev, type, data, username) VALUES($1, $2, $3, $4, $5)",
                      [this.channel, rev, "patch", patch.toJSON(), this.username],
                      function (err, result) { if (err) return this.handleError(err); cb(result); }.bind(this));
    },
    
    commit: function(head, patch, cb) {
        console.error("DEBUG: commit");
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
        console.error("DEBUG: reset");
        this.db.query("DELETE FROM history WHERE obj = $1 AND rev > 1", [this.channel], function(err, result) {
            if (err) return this.handleError(err);
            cb(result);
        }.bind(this));
    },
    
    list: function(cb) {
        console.error("DEBUG: list");
        this.db.query("SELECT obj FROM history GROUP BY obj ORDER BY obj", [], function(err, result) {
            if (err) return this.handleError(err);
            var list = [];
            for (var i = 0; i < result.rows.length; i++) {
                list.push({name: result.rows[i].obj});
            }
            cb(list);
        }.bind(this));
    },
    
    info: function(cb) {
        console.error("DEBUG: info");
        var query = "SELECT MAX(rev) AS rev, " +
                           "MIN(date) AS created, " +
                           "MAX(date) AS latest, " +
                           "SUM(CHAR_LENGTH(data)) AS bytes " +
                    "FROM history " +
                    "WHERE obj = $1 " +
                    "GROUP BY obj ";
        this.db.query(query, [this.channel], function(err, result) {
            if (err) return this.handleError(err);
            if (result.rows.length != 1) return this.handleError("info: expected one result");
            var info = {};
            info.name = this.channel;
            info.rev = result.rows[0].rev;
            info.created = result.rows[0].created;
            info.latest = result.rows[0].latest;
            info.bytes = result.rows[0].bytes;
            this.db.query("SELECT username, COUNT(*) AS revisions FROM history WHERE obj = $1 GROUP BY username ORDER BY revisions DESC",
                          [this.channel], function(err2, result2) {
                if (err2) return this.handleError(err2);
                info.contributors = [];
                for (var i = 0; i < result2.rows.length; i++) {
                    info.contributors.push({
                        name: result2.rows[i].username,
                        revisions: result2.rows[i].revisions
                    });
                }
                cb(info);
            }.bind(this));
        }.bind(this));
    },
    
    remove: function(cb) {
        console.error("DEBUG: remove");
        this.db.query("DELETE FROM history WHERE obj = $1", [this.channel], function(err, result) {
            if (err) return this.handleError(err);
            cb(result);
        }.bind(this));
    }
});


Object.subclass('users.cschuster.sync.Server', {
    initialize: function(socket) {
        this.socket = socket;
        this.username = 'anonymous';
        // repository interface
        this.socket.on('checkout', this.checkout.bind(this));
        this.socket.on('update', this.update.bind(this));
        this.socket.on('reset', this.reset.bind(this));
        this.socket.on('commit', this.commit.bind(this));
        // session interface
        this.socket.on('join', this.join.bind(this));
        // management interface
        this.socket.on('list', this.list.bind(this));
        this.socket.on('info', this.info.bind(this));
        this.socket.on('create', this.create.bind(this));
        this.socket.on('remove', this.remove.bind(this));
    },
    
    withRepo: function(channel, exclusive, cb) {
        new users.cschuster.sync.Repository(channel, exclusive, function(repo) {
            repo.username = this.username;
            cb(repo);
        }.bind(this));
    },
    
    checkout: function(channel, rev) {
        console.log("checking out rev " + rev);
        this.withRepo(channel, false, function(repo) {
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
                    this.socket.emit('snapshot', head || 1, snapshot.data);
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
                    if (oldRev > head) {
                        console.error("received patch based on a non-server version");
                    } else {
                        console.error("received outdated patch");
                    }
                    repo.release();
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
    },
    
    list: function() {
        console.log("listing channels");
        this.withRepo(null, false, function(repo) {
            repo.list(this.socket.emit.bind(this.socket, 'list'));
        }.bind(this));
    },
    
    info: function(channel) {
        console.log("requesting info about channel " + channel);
        this.withRepo(channel, false, function(repo) {
            repo.info(this.socket.emit.bind(this.socket, 'info'));
        }.bind(this));
    },
    
    create: function(channel, username) {
        console.log(username + " creates channel " + channel);
        this.username = username || 'anonymous';
        this.withRepo(channel, true, function(repo) {
            repo.head(function (head) {
                if (!head) {
                    repo.initial(function() { repo.release(); });
                } else {
                    repo.release();
                }
            }.bind(this));
        }.bind(this));
    },

    remove: function(channel) {
        console.log("removing channel " + channel);
        this.withRepo(channel, true, function(repo) {
        	repo.remove(function() { repo.release(); });
        });
    }
});

io.set('log level', 1);
io.set('transports', ['htmlfile', 'xhr-polling', 'jsonp-polling']);
io.sockets.on('connection', function(socket) {
    new users.cschuster.sync.Server(socket);
});

});
