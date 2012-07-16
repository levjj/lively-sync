var EventEmitter = require('events').EventEmitter;

require('./lk');

Object.subclass('user.cschuster.sync.Mutex', {
    initialize: function() {
        var queue = new EventEmitter();
        var locked = false;
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
