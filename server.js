var io = require('socket.io').listen(6700);
var Seq = require('seq');
var jsondiffpatch = require('jsondiffpatch');
var pg = require('pg');
require('./lk');
require('./mutex');
require('./sync');

var CONNECTION_STRING = "tcp://syncproto:steam@localhost/syncproto";
var DIFFS_PER_SNAPSHOT = 20;
var DEMO = 'demo';

var Repository = {
    init: function(cb) {
        pg.connect(CONNECTION_STRING, function(err, db) {
            if (err) return console.error(err);
            this.db = db;
            cb();
        }.bind(this));
    },
    
    checkout: function(rev, cb) {
        if (!rev) rev = this.head(this.checkout.bind(this));
        var from = this.latestSnapshotBefore(rev, function(from) {
            this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev >= $2 AND rev <= $3", [DEMO, from, rev], function(err, result) {
                if (err) return console.error(err);
                if (result.rows.length < 1) return console.error("checkout: no revision between " + from + " and " + rev);
                if (result.rows[0].type != "snapshot") return console.error("checkout: expected rev " + from + " to be a snapshot");
                var snapshot = JSON.parse(result.rows[0].data);
                for (var i = 1; i < result.rows.length; i++) {
                    if (result.rows[i].type != "diff") return console.error("checkout: expected rev " + from + " to be a diff");
                    snapshot = jsondiffpatch.patch(snapshot, JSON.parse(result.rows[i].data));
                }
                cb(snapshot);
            });
        }.bind(this));
    },
    
    _computedDiffToSnapshot: function(fromRev, toSnapshot, cb) {
        this.checkout(fromRev, function(fromSnapshot) {
            var diff = jsondiffpatch.diff(fromSnapshot, toSnapshot);
            if (diff) cb(diff);
        });
    },
    
    _storedDiff: function(fromRev, toRev, cb) {
        this.db.query("SELECT type, data FROM history WHERE obj = $1 AND rev = $2", [DEMO, rev], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("stored diff: expected one result");
            var data = JSON.parse(results.row[0].data);
            if (result.rows[0].type == "snapshot") {
                this._computedDiffToSnapshot(fromRev, data, cb);
            } else {
                cb(data);
            }
        }.bind(this));
    },
    
    _computedDiff: function(fromRev, toRev, cb) {
        this.checkout(toRev, function(toSnapshot) {
            this._computedDiffToSnapshot(fromRev, toSnapshot, cb);
        }.bind(this));
    },
    
    diff: function(fromRev, toRev, cb) {
        if (toRev - fromRev == 1) {
            this._storedDiff(fromRev, toRev, cb);
        } else {
            this._computedDiff(fromRev, toRev, cb);
        }
    },
    
    head: function(cb) {
        this.db.query("SELECT MAX(rev) AS head FROM history WHERE obj = $1", [DEMO], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("head: expected one result");
            cb(result.rows[0].head);
        });
    },
    
    latestSnapshotBefore: function(rev, cb) {
        this.db.query("SELECT MAX(rev) AS latest FROM history WHERE obj = $1 AND type = 'snapshot' AND rev <= $2", [DEMO, rev], function(err, result) {
            if (err) return console.error(err);
            if (result.rows.length != 1) return console.error("latest snapshot: expected one result");
            cb(result.rows[0].latest);
        });
    },
    
    _createSnapshot: function(head, patch) {
        this.checkout(head, function(oldHead) {
            var newHead = jsondiffpatch.patch(oldHead, patch);
            console.log("creating snapshot for revision " + (head + 1));
            this.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "snapshot", JSON.stringify(newHead)]);
        }.bind(this));
    },
    
    commit: function(head, patch) {
        this.latestSnapshotBefore(head, function(latest) {
            if (head - latest > DIFFS_PER_SNAPSHOT) {
                this._createSnapshot(head, patch);
            } else {
                console.log("creating patch for revision " + (head + 1));
                this.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "diff", JSON.stringify(patch)]);
            }
        }.bind(this));
    },
    
    reset: function() {
        this.db.query("DELETE FROM history WHERE rev > 1");
    }
};

var Server = {
    init: function(socket) {
        this.socket = socket;
        this.socket.on('checkout', this.checkout.bind(this));
        this.socket.on('update', this.update.bind(this));
        this.socket.on('commit', this.commit.bind(this));
    },
    
    withRepo: function(cb) {
        var repo = Object.create(Repository);
        repo.init(function() {
            cb(repo);
        });
    },
    
    checkout: function (rev) {
        console.log("checking out rev " + rev);
        this.withRepo(function(repo) {
            repo.checkout(rev, this.socket.emit.bind(this.socket, 'snapshot', rev));
        }.bind(this));
    },
    
    update: function (fromRev) {
        console.log("requested update from rev " + fromRev);
        this.withRepo(function(repo) {
            repo.head(function (head) {
                if (!fromRev || (fromRev < head - DIFFS_PER_SNAPSHOT)) {
                    console.log('sending snapshot upon request');
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
    
    commitMutex: new Mutex(),
    
    //FIXME: this will be removed as soon as diff/patch works
    commit: function (oldRev, snapshot) {
        console.log("commiting from rev " + oldRev);
        this.commitMutex.lock(function() {
            this.withRepo(function(repo) {
                repo.head(function (head) {
                    this.socket.broadcast.emit('snapshot', head + 1, snapshot);
                    repo.db.query("INSERT INTO history(obj, rev, type, data) VALUES($1, $2, $3, $4)", [DEMO, head + 1, "snapshot", JSON.stringify(snapshot)], function() {
                        this.commitMutex.release();
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        }.bind(this));
    },
    
    commitPatch: function (oldRev, patch) {
        //TODO: BEGIN; LOCK TABLE history IN EXCLUSIVE mode; ...; COMMIT;
        this.withRepo(function(repo) {
            repo.head(function (head) {
                if (oldRev == head) {
                    repo.commit(head, patch);
                    this.socket.broadcast.emit('patch', head + 1, patch);
                } else {
                    Seq([oldRev, head])
                    .parMap(function (rev) {
                        repo.checkout(rev, this.bind(this, null));
                    })
                    .seq(function (old, mine) {
                        console.error("diff3 not implemented yet in jsondiffpatch");
                        //var yours = xdiff.patch(old, patch);
                        //var newPatch = xdiff.diff3(mine, yours, old);
                        //if (newPatch) {
                        //    repo.commit(head, newPatch);
                        //    this.socket.broadcast.emit('patch', head + 1, newPatch);
                        //}
                        //var myPatch = xdiff.diff(yours, mine);
                        //if (myPatch) {
                        //    this.socket.emit('patch', head + 1, myPatch);
                        //}
                    }.bind(this));
                }
            }.bind(this));
        }.bind(this));
    }
};

var logger = new users.cschuster.sync.Diff();
logger.sayHello();

/*
Server.withRepo(function(repo) {repo.reset()});

io.set('log level', 2);
io.sockets.on('connection', function (socket) {
    var server = Object.create(Server);
    server.init(socket);
});
*/