if (typeof exports !== 'undefined') {
  module = require('./lk').module;
}

module('users.cschuster.sync').requires().toRun(function() {
    Object.subclass('users.cschuster.sync.Diff', {
        sayHello: function() { console.log('hello'); }
    });
});
