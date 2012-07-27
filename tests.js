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
        return users.cschuster.sync.Snapshot.createFromObjects(object);
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
    addRectPatch: function(rect, optOwner) {
        var path = optOwner ? (optOwner.id + "/submorphs/0") : rect.id;
        var width = rect.getExtent().x, height = rect.getExtent().y;
        var raw = {
            "": {submorphs:[],scripts:[],_ClipMode:"visible",derivationIds:[],
                 id:rect.id, droppingEnabled:true,halosEnabled:true,
                 __LivelyClassName__:"lively.morphic.Box",
                 __SourceModuleName__:"Global.lively.morphic.Core"},
            "/_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/eventHandler": {morph:{__isSmartRef__:true,id:path},
                __LivelyClassName__:"lively.morphic.EventHandler",
                __SourceModuleName__:"Global.lively.morphic.Events"},
            "/renderContextTable": rect.htmlDispatchTable,
            "/shape": {_NodeClass:["Morph","Box"],
                __LivelyClassName__:"lively.morphic.Shapes.Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Shapes"},
            "/shape/_Extent": {"x":width,"y":height,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/shape/_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/shape/_Padding": {"x":0,"y":0,"width":0,"height":0,
                __LivelyClassName__:"Rectangle",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/shape/renderContextTable": rect.shape.htmlDispatchTable
        };
        var result = {};
        Properties.forEachOwn(raw, function(k,v) { result[path + k] = [v]; });
        if (optOwner) result[path][0].owner = {__isSmartRef__:true,id:optOwner.id};
        return result;
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
        expected = this.addRectPatch(this.rect);
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
        var expected = this.addRectPatch(submorph, this.rect);
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
    },
    testAddScript: function() {
        var snapshotA = this.serialize(this.table);
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/__serializedLivelyClosures__"] = [{}];
        expected[this.rect.id + "/__serializedLivelyClosures__/tick"] = [{
            source:"function tick() { return \"tack\"; }",
            __LivelyClassName__:"lively.Closure",
            __SourceModuleName__:"Global.lively.lang.Closure"
        }];
        expected[this.rect.id + "/__serializedLivelyClosures__/tick/varMapping"] = [{
            "this": {__isSmartRef__:true, id: this.rect.id}
        }];
        expected[this.rect.id + "/__serializedLivelyClosures__/tick/funcProperties"] = [{}];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testRemoveScript: function() {
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotA = this.serialize(this.table);
        delete this.rect.tick;
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/__serializedLivelyClosures__"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testUpdateScript: function() {
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotA = this.serialize(this.table);
        this.rect.addScript(function tick() { return "tock"; });
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/__serializedLivelyClosures__/tick"] = {
            source: ["function tick() { return \"tock\"; }"]};
        this.assertPatch(expected, snapshotA, snapshotB);
    }
});
lively.morphic.tests.TestCase.subclass('users.cschuster.sync.tests.MorphPatchTest',
'running', {
    setUp: function($super) {
        $super();
        this.createWorld();
        this.morph = this.newBox("X", 4, 4);
        this.world.addMorph(this.morph);
        this.control = new users.cschuster.sync.WorkingCopy();
        this.control.addPlugin(new users.cschuster.sync.MorphPlugin(this.world));
        this.control.addObject(this.morph);
    }
},
'helping', {
    newBox: function(id, width, height) {
        var bounds = pt(0,0).extent(pt(width, height));
        var morph = new lively.morphic.Box(bounds);
        morph.id = id;
        return morph;
    },
    patch: function(patchData) {
        var patch = new users.cschuster.sync.Patch(Object.deepCopy(patchData));
        this.control.loadPatch(patch);
    },
    div: function(/*args*/) {
        var result = {tagName: 'div'};
        for (var i = 0; i < arguments.length; i++) {
            var arg = arguments[i];
            if (arg.tagName) {
                if (!result.childNodes) result.childNodes = [];
                result.childNodes.push(arg);
            } else {
                Object.extend(result, arg);
            }
        }
        return result;
    },
    hand: function() {
        return this.div(this.div({attributes: {class: 'Morph HandMorph'}}));
    }
},
'assertion', {
    assertMorphNode: function(expected) {
        this.assertNodeMatches(expected, this.morph.renderContext().getMorphNode());
    },
    assertShapeNode: function(expected) {
        this.assertNodeMatches(expected, this.morph.renderContext().getShapeNode());
    },
    assertWorldNode: function(expected) {
        this.assertNodeMatches(expected, this.world.renderContext().getShapeNode());
    }
},
'specs', {
    moveXPatch: {"X/_Position": {x: [5]} },
    moveXYPatch: {"X/_Position": {x: [5], y: [3]} },
    resizePatch: {"X/shape/_Extent": {x: [13], y: [7]} },
    colorPatch: {"X/shape/_Fill": [{r: 0.5, g: 0.0, b: 1.0, a:1,
                                    __LivelyClassName__:"Color",
                                    __SourceModuleName__:"Global.lively.morphic.Graphics"}]},
    transparentPatch: {"X/shape": {_Fill: [null]}},
    addRectPatch: users.cschuster.sync.tests.DiffTest.prototype.addRectPatch,
    removeMorphPatch: {"X": [0,0]},
    removeSubmorphPatch: {"X/submorphs/0": [0,0]},
    addScriptPatch: {},
    removeScriptPatch: {"X/__serializedLivelyClosures__": [0,0]},
    updateScriptPatch: {"X/__serializedLivelyClosures__/0": {
        source:["function tick() { return \"tock\"; }"]}}
},
'testing', {
    testMoveX: function() {
        this.patch(this.moveXPatch);
        this.assertMorphNode(this.div({style: {left: '5px'}}));
    },
    testMoveXY: function() {
        this.patch(this.moveXYPatch);
        this.assertMorphNode(this.div({style: {left: '5px', top: '3px'}}));
    },
    testResize: function() {
        this.patch(this.resizePatch);
        this.assertShapeNode(this.div({style: {width: '13px', height: '7px'}}));
    },
    testColor: function() {
        this.patch(this.colorPatch);
        this.assertShapeNode(this.div({style: {background: 'rgb(127,0,255)'}}));
    },
    testTransparent: function() {
        this.morph.setFill(Color.red);
        this.patch(this.transparentPatch);
        this.assertShapeNode(this.div({style: {background: ''}}));
    },
    testAddMorph: function() {
        var morph2 = this.newBox("Y", 5, 5);
        this.control.addObject(morph2);
        this.patch(this.addRectPatch(morph2));
        this.assertWorldNode(
            this.div(
                this.div(
                    this.div(this.div({style: {width: '4px', height: '4px'}})),
                    this.div(this.div({style: {width: '5px', height: '5px'}})),
                    this.hand()
                )
            )
        );
    },
    testRemoveMorph: function() {
        this.patch(this.removeMorphPatch);
        this.assertWorldNode(this.div(this.div(this.hand())));
    },
    testAddSubmorph: function() {
        var submorph = this.newBox("Z", 2, 2);
        this.patch(this.addRectPatch(submorph, this.morph));
        this.assertShapeNode(this.div(this.div(
            this.div(this.div({style: {width: '2px', height: '2px'}}))
        )));
    },
    testRemoveSubmorph: function() {
        var submorph = this.newBox("Z", 2, 2);
        this.morph.addMorph(submorph);
        this.patch(this.removeSubmorphPatch);
        this.assertShapeNode(this.div(this.div({childNodes: []})));
    },
    testAddScript: function() {
        this.patch(addScriptPatch);
        this.assertEquals("tack", this.rect.tick());
    },
    testRemoveScript: function() {
        this.rect.addScript(function tick() { return "tack"; });
        this.patch(removeScriptPatch);
        this.assert(!this.rect.hasOwnProperty("tick"));
    },
    testUpdateScript: function() {
        this.rect.addScript(function tick() { return "tack"; });
        this.patch(updateScriptPatch);
        this.assertEquals("tock", this.rect.tick());
    }
});
}) // end of module
