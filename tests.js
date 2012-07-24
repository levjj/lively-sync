module('users.cschuster.sync.tests').requires('lively.TestFramework', 'lively.morphic.tests.Helper', 'users.cschuster.sync.client').toRun(function() {

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
        return snapshot.createFromObjects(object);
    },
    assertPatch: function(expected, snapshotA, snapshotB) {
        var patch = snapshotA.diff(snapshotB).toPatch();
        this.assertMatches(expected, patch.data);
        this.assertMatches(patch.data, expected);
        patch.apply(snapshotA);
        this.assertMatches(snapshotA.data, snapshotB.data);
        this.assertMatches(snapshotB.data, snapshotA.data);
    }
},
'specs', {
    addRectPatch: function(rect, path) {
        var width = rect.getExtent().x, height = rect.getExtent().y;
        return {
            "": {submorphs:[],scripts:[],_ClipMode:"visible",derivationIds:[],
                 id:rect.id, droppingEnabled:true,halosEnabled:true,
                 __LivelyClassName__:"lively.morphic.Box",
                 __SourceModuleName__:"Global.lively.morphic.Core"},
            "_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "eventHandler": {morph:{__isSmartRef__:true,id:path},
                __LivelyClassName__:"lively.morphic.EventHandler",
                __SourceModuleName__:"Global.lively.morphic.Events"},
            "renderContextTable": rect.htmlDispatchTable,
            "shape": {_NodeClass:["Morph","Box"],
                __LivelyClassName__:"lively.morphic.Shapes.Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Shapes"},
            "shape/_Extent": {"x":width,"y":height,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/_Padding": {"x":0,"y":0,"width":0,"height":0,
                __LivelyClassName__:"Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "shape/renderContextTable": rect.shape.htmlDispatchTable
        };
    }
},
'testing', {
    testIdenticalRectangle: function() {
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize(this.table);
        var diff = snapshotA.diff(snapshotB);
        this.assert(diff.toPatch().isEmpty(), 'no diff for identical morphs');
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
    testColorRectangle: function () {
        var snapshotA = this.serialize(this.table);
        this.rect.setFill(Color.black);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        var serializedBlack = this.serialize(Color.black).data.registry[""];
        expected[this.rect.id + "/shape/_Fill"] = [serializedBlack];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testTransparentRectangle: function () {
        this.rect.setFill(Color.black);
        var snapshotA = this.serialize(this.table);
        this.rect.setFill(null);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/shape"] = {_Fill: [null]};
        expected[this.rect.id + "/shape/_Fill"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testUnColorRectangle: function () {
        this.rect.setFill(Color.black);
        var snapshotA = this.serialize(this.table);
        delete this.rect.shape._Fill;
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/shape/_Fill"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddMorph: function() {
        var snapshotA = this.serialize({});
        var snapshotB = this.serialize(this.table);
        var expected = {};
        var copy = this.addRectPatch(this.rect, this.rect.id);
        expected[this.rect.id] = [copy[""]];
        Properties.forEachOwn(copy, function(key) {
            if (key)
                expected[this.rect.id + "/" + key] = [copy[key]];
        }, this);
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testRemoveMorph: function() {
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize({});
        var expected = {};
        expected[this.rect.id] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddSubmorph: function() {
        var snapshotA = this.serialize(this.table);
        var bounds = pt(0,0).extent(pt(20,20));
        var submorph = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        var prefix = this.rect.id + "/submorphs/0";
        var copy = this.addRectPatch(submorph, prefix);
        expected[prefix] = [copy[""]];
        expected[prefix][0].owner = {__isSmartRef__:true,id:this.rect.id};
        Properties.forEachOwn(copy, function(key) {
            if (key)
                expected[prefix + "/" + key] = [copy[key]];
        }, this);
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testRemoveSubmorph: function() {
        var bounds = pt(0,0).extent(pt(20,20));
        var submorph = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph);
        var snapshotA = this.serialize(this.table);
        this.rect.removeMorph(submorph);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/submorphs/0"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testDiffingDoesNotAffectSnapshot: function() {
        var snapshotA = this.serialize({});
        var snapshotB = this.serialize(this.table);
        this.assert(snapshotB.data.registry[this.rect.id].shape.__isSmartRef__);
        var patch = snapshotB.diff(snapshotA).toPatch();
        this.assert(snapshotB.data.registry[this.rect.id].shape.__isSmartRef__);
    }
});
lively.morphic.tests.TestCase.subclass('users.cschuster.sync.tests.MorphPatchTest',
'running', {
    setUp: function($super) {
        $super();
        this.createWorld();
        var bounds = pt(0,0).extent(pt(4,4));
        this.morph = new lively.morphic.Box(bounds);
        this.morph.id = "X";
        this.world.addMorph(this.morph);
        this.control = new users.cschuster.sync.Control();
        this.control.addPlugin(new users.cschuster.sync.MorphPlugin());
        this.control.addObject(this.morph);
    }
},
'helping', {
    patch: function(patchData) {
        var patch = new users.cschuster.sync.Patch(patchData);
        this.control.loadPatch(patch);
    }
},
'assertion', {
    assertShapeNode: function(expected) {
        this.assertNodeMatches(expected, this.morph.renderContext().getShapeNode());   
    }
},
'specs', {
    moveXPatch: { "X/_Position": {x: [5]} },
    moveXYPatch: { "X/_Position": {x: [5], y: [3]} },
},
'testing', {
    testMoveX: function() {
        this.patch(this.moveXPatch);
        this.assertShapeNode({style: {left: '5px'}});
    },
    testMoveXY: function() {
        this.patch(this.moveXYPatch);
        this.assertShapeNode({style: {left: '5px', top: '3px'}});
    }
});
}) // end of module
