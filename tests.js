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
    },
    assertPatch: function(expected, snapshotA, snapshotB) {
        var patch = snapshotA.diff(snapshotB).toPatch();
        this.assertMatches(expected, patch.data);
        this.assertMatches(patch.data, expected);
        //patch.apply(snapshotA);
        //this.assertMatches(snapshotA, snapshotB);
        //this.assertMatches(snapshotB, snapshotA);
    }
},
'specs', {
    addRectPatch: function() {
        return {
            "": {submorphs:[],scripts:[],_ClipMode:"visible",derivationIds:[],
                 id:this.rect.id, droppingEnabled:true,halosEnabled:true,
                 __LivelyClassName__:"lively.morphic.Box",
                 __SourceModuleName__:"Global.lively.morphic.Core"},
            "_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "eventHandler": {morph:{__isSmartRef__:true,id:this.rect.id},
                __LivelyClassName__:"lively.morphic.EventHandler",
                __SourceModuleName__:"Global.lively.morphic.Events"},
            "renderContextTable": lively.morphic.Morph.prototype.htmlDispatchTable,
            "shape": {_NodeClass:["Morph","Box"],
                __LivelyClassName__:"lively.morphic.Shapes.Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Shapes"},
            "shape/_Extent": {"x":100,"y":100,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/_Padding": {"x":0,"y":0,"width":0,"height":0,
                __LivelyClassName__:"Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/renderContextTable": lively.morphic.Shapes.Shape.prototype.htmlDispatchTable
        };
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
        var expected = {};
        expected[this.rect.id + "/shape/_Extent"] = {x: [400], y: [20]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testMovedRectangle: function () {
        var snapshotA = this.serialize(this.table);
        var oldX = this.rect._Position.x;
        var oldY = this.rect._Position.y;
        this.rect.moveBy(pt(10,20));
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/_Position"] = {x: [oldX+10], y: [oldY+20]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddMorph: function() {
        var snapshotA = this.serialize({});
        var snapshotB = this.serialize(this.table);
        var expected = {};
        var copy = this.addRectPatch();
        expected[this.rect.id] = [copy[""]];
        Properties.own(copy).each(function(key) {
            if (key)
                expected[this.rect.id + "/" + key] = [copy[key]];
        }.bind(this));
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testRemoveMorph: function() {
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize({});
        var expected = {};
        expected[this.rect.id] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    }
});
}) // end of module
