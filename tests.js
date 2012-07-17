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
    },
    testResizedRectangle: function() {
        var snapshotA = this.serialize(this.table);
        this.rect.setExtent(pt(400,20));
        var snapshotB = this.serialize(this.table);
        var patch = snapshotA.diff(snapshotB).toPatch();
        var expected = {};
        expected[this.rect.id + "/shape/_Extent"] = {x: [400], y: [20]};
        this.assertMatches(expected, patch.data);
        this.assertMatches(patch.data, expected);
    },
    testMovedRectangle: function () {
        var snapshotA = this.serialize(this.table);
        var oldX = this.rect._Position.x;
        var oldY = this.rect._Position.y;
        this.rect.moveBy(pt(10,20));
        var snapshotB = this.serialize(this.table);
        var patch = snapshotA.diff(snapshotB).toPatch();
        var expected = {};
        expected[this.rect.id + "/_Position"] = {x: [oldX+10], y: [oldY+20]};
        this.assertMatches(expected, patch.data);
        this.assertMatches(patch.data, expected);
    },
    testRemoveMorph: function() {
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize({});
        var patch = snapshotA.diff(snapshotB);
        var expected = {};
        expected[this.rect.id] = [0,0];
        this.assertMatches(expected, patch.data);
        this.assertMatches(patch.data, expected);
    }
});
}) // end of module
