module('users.cschuster.sync.tests').requires('lively.TestFramework').toRun(function() {

TestCase.subclass('users.cschuster.sync.tests.DiffTest',
'helper', {
    setUp: function() {
        this.tracker = new users.cschuster.Tests.LifeTracker();
    }
},
'testing', {
    testInitial: function() {
        this.assertEquals(this.tracker.getLife(), 20);
        this.assert(this.tracker.isAlive());
        this.assert(!this.tracker.isDead());
    },
}) // end of module
