module('users.cschuster.sync.tests').requires('lively.TestFramework', 'users.cschuster.sync.client').toRun(function() {

TestCase.subclass('users.cschuster.sync.tests.DiffTest',
'helper', {
    setUp: function() {
        var bounds = pt(0,0).extent(pt(100,100));
        this.rect = new lively.morphic.Box(bounds);
        this.table = {};
        this.table[this.rect.id] = this.rect;
    },
    serialize: function(object) {
        var snapshot = new users.cschuster.sync.Snapshot();
        return snapshot.create(object);
    }
},
'testing', {
    testIdenticalRectangle: function() {
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize(this.table);
        var diff = snapshotA.diff(snapshotB);
        this.assertEquals(diff, undefined, 'no diff for identical morphs');
    }
});
}) // end of module


odule('users.cschuster.sync.tests').requires('lively.TestFramework').toRun(function() {

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
