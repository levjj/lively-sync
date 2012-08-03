module('users.cschuster.sync.tests').requires('lively.TestFramework', 'lively.morphic.tests.Helper', 'users.cschuster.sync.client').toRun(function() {

lively.morphic.tests.TestCase.subclass('users.cschuster.sync.tests.DiffTest',
'helper', {
    setUp: function($super) {
        $super();
        this.createWorld();
        var bounds = pt(0,0).extent(pt(100,100));
        this.rect = new lively.morphic.Box(bounds);
        this.table = {};
        this.table[this.rect.id] = this.rect;
    },
    serialize: function(object) {
        return users.cschuster.sync.Snapshot.createFromObjects(object);
    },
    assertPatch: function(expected, snapshotA, snapshotB) {
        if (snapshotB == undefined) {
            snapshotB = snapshotA;
            snapshotA = expected;
            expected = undefined;
        }
        var patch = snapshotA.diff(snapshotB).toPatch();
        if (expected != undefined)
            this.assertEqualState(expected, patch.data);
        patch.apply(snapshotA);
        this.assertEqualState(snapshotA, snapshotB);
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
            "/renderContextTable": rect.renderContextTable,
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
            "/shape/renderContextTable": rect.shape.renderContextTable
        };
        var result = {};
        Properties.forEachOwn(raw, function(k,v) { result[path + k] = [v]; });
        if (optOwner) result[path][0].owner = {__isSmartRef__:true,id:optOwner.id};
        return result;
    },
    addPolygonPatch: function(morph) {
        var result = this.addRectPatch(morph);
        delete result[morph.id + "/_Position"];
        result[morph.id][0].__LivelyClassName__ = "lively.morphic.Path";
        result[morph.id][0].__SourceModuleName__ = "Global.lively.morphic.AdditionalMorphs";
        var raw = {
            "/shape": {dontChangeShape:false, cachedVertices:null, _PathElements:[],
                       _BorderWidth:1, _NodeClass:["Morph","Path"], _BorderColor: undefined,
                       __LivelyClassName__:"lively.morphic.Shapes.Path", _Fill: undefined,
                       __SourceModuleName__:"Global.lively.morphic.PathShapes"},
            "/shape/_Position": {x:-1,y:-1,__LivelyClassName__:"Point",
                                 __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/shape/_PathElements/0": {isAbsolute:true,"x":4,"y":0,
                                       __LivelyClassName__:"lively.morphic.Shapes.MoveTo",
                                       __SourceModuleName__:"Global.lively.morphic.PathShapes"},
            "/shape/_PathElements/1": {isAbsolute:true,"x":4,"y":4,
                                       __LivelyClassName__:"lively.morphic.Shapes.LineTo",
                                       __SourceModuleName__:"Global.lively.morphic.PathShapes"},
            "/shape/_PathElements/2": {isAbsolute:true,"x":0,"y":4,
                                       __LivelyClassName__:"lively.morphic.Shapes.LineTo",
                                       __SourceModuleName__:"Global.lively.morphic.PathShapes"}
        };
        Properties.forEachOwn(raw, function(k,v) { result[morph.id + k] = [v]; });
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
    },
    testAddSecondScript: function() {
        this.rect.addScript(function tag() { return "nag"; });
        var snapshotA = this.serialize(this.table);
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotB = this.serialize(this.table);
        var expected = {};
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
    testRemoveSecondScript: function() {
        this.rect.addScript(function tag() { return "nag"; });
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotA = this.serialize(this.table);
        delete this.rect.tick;
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/__serializedLivelyClosures__/tick"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddMorphWithScript: function() {
        var snapshotA = this.serialize({});
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected = this.addRectPatch(this.rect);
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
    testRemoveMorphWithScript: function() {
        this.rect.addScript(function tick() { return "tack"; });
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize({});
        var expected = {};
        expected[this.rect.id] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddMorphWithSubmorph: function() {
        var snapshotA = this.serialize({});
        var bounds = pt(0,0).extent(pt(20,20));
        var submorph = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph);
        var snapshotB = this.serialize(this.table);
        var expected = this.addRectPatch(this.rect);
        Object.extend(expected, this.addRectPatch(submorph, this.rect));
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testRemoveMorphWithSubmorph: function() {
        var bounds = pt(0,0).extent(pt(20,20));
        var submorph = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph);
        var snapshotA = this.serialize(this.table);
        var snapshotB = this.serialize({});
        var expected = {};
        expected[this.rect.id] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testAddPolygon: function() {
        var snapshotA = this.serialize(this.table);
        var polygon = lively.morphic.Morph.makePolygon(
            [pt(4, 0), pt(4, 4), pt(0, 4)], 1);
        this.table[polygon.id] = polygon;
        var snapshotB = this.serialize(this.table);
        var expected = this.addPolygonPatch(polygon);
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testOpenObjectInspector: function() {
        this.table = {};
        var snapshotA = this.serialize(this.table);
        var inspector = this.world.openInspectorFor({a:23});
        this.table[inspector.id] = inspector;
        var snapshotB = this.serialize(this.table);
        this.assertPatch(snapshotA, snapshotB);
    },
    testGrabMorph: function() {
        var snapshotA = this.serialize(this.table);
        this.rect.openInHand();
        var snapshotB = this.serialize(this.table);
        this.assertPatch(snapshotA, snapshotB);
    },
    testGrabBasicRectangle: function() {
        this.table = {};
        var snapshotA = this.serialize(this.table);
        var rect = this.world.openPartItem("Rectangle", "PartsBin/Basic");
        this.table[rect.id] = rect;
        var snapshotB = this.serialize(this.table);
        this.assertPatch(snapshotA, snapshotB);
        rect.openInHand();
        var snapshotC = this.serialize(this.table);
        this.assertPatch(snapshotB, snapshotC);
        this.assertPatch(snapshotA, snapshotC);
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
    },
    diffToEmpty: function() {
        var table = this.control.syncTable;
        var current = users.cschuster.sync.Snapshot.createFromObjects(table);
        var empty = users.cschuster.sync.Snapshot.empty();
        return empty.diff(current).toPatch();
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
    addScriptPatch: function(first) {
        var result = {}
        if (first) result["X/__serializedLivelyClosures__"] = [{}];
        Object.extend(result, {
            "X/__serializedLivelyClosures__/tick": [{
                source:"function tick() { return \"tack\"; }",
                __LivelyClassName__:"lively.Closure",
                __SourceModuleName__:"Global.lively.lang.Closure"
            }],
            "X/__serializedLivelyClosures__/tick/varMapping": [{
                "this": {__isSmartRef__:true, id: "X"}
            }],
            "X/__serializedLivelyClosures__/tick/funcProperties": [{}]});
        return result;
    },
    removeScriptPatch: {"X/__serializedLivelyClosures__": [0,0]},
    updateScriptPatch: {"X/__serializedLivelyClosures__/tick": {
        source:["function tick() { return \"tock\"; }"]}},
    removeSecondScriptPatch: {"X/__serializedLivelyClosures__/tick": [0,0]},
    addPolygonPatch: users.cschuster.sync.tests.DiffTest.prototype.addPolygonPatch
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
        this.assertShapeNode(this.div({childNodes: []}));
    },
    testAddScript: function() {
        this.patch(this.addScriptPatch(true));
        this.assertEquals("tack", this.morph.tick());
    },
    testRemoveScript: function() {
        this.morph.addScript(function tick() { return "tack"; });
        this.patch(this.removeScriptPatch);
        this.assert(!this.morph.hasOwnProperty("tick"));
    },
    testUpdateScript: function() {
        this.morph.addScript(function tick() { return "tack"; });
        this.patch(this.updateScriptPatch);
        this.assertEquals("tock", this.morph.tick());
    },
    testAddSecondScript: function() {
        this.morph.addScript(function tag() { return "nag"; });
        this.patch(this.addScriptPatch(false));
        this.assertEquals("nag", this.morph.tag());
        this.assertEquals("tack", this.morph.tick());
    },
    testRemoveSecondScript: function() {
        this.morph.addScript(function tag() { return "nag"; });
        this.morph.addScript(function tick() { return "tack"; });
        this.patch(this.removeSecondScriptPatch);
        this.assertEquals("nag", this.morph.tag());
        this.assert(!this.morph.hasOwnProperty("tick"));
    },
    testAddMorphWithScript: function() {
        this.patch(this.removeMorphPatch);
        var morph2 = this.newBox("X", 5, 5);
        morph2.addScript(function tag() { return "nag"; });
        var patch = this.addRectPatch(morph2);
        Object.extend(patch, this.addScriptPatch(false));
        this.patch(patch);
        this.assertEquals("tack", this.world.submorphs.first().tick());
    },
    testAddMorphWithSubmorph: function() {
        this.patch(this.removeMorphPatch);
        var morph2 = this.newBox("Q", 2, 7);
        var submorph = this.newBox("P", 1, 3);
        morph2.addMorph(submorph);
        var patch = this.addRectPatch(morph2);
        Object.extend(patch, this.addRectPatch(submorph, morph2));
        this.patch(patch);
        this.assertWorldNode(
            this.div(this.div(
                this.div(this.div({style: {width: '2px', height: '7px'}},
                    this.div(this.div(this.div({style: {width: '1px', height: '3px'}})))
                )),
                this.hand()
            ))
        );
    },
    testAddPolygon: function() {
        var polygon = lively.morphic.Morph.makePolygon(
            [pt(4, 0), pt(4, 4), pt(0, 4)], 1);
        polygon.id = "Z";
        this.patch(this.addPolygonPatch(polygon));
        this.assertWorldNode(
            this.div(
                this.div(
                    this.div(this.div({style: {width: '4px', height: '4px'}})),
                    this.div(this.div({tagName: "svg"})),
                    this.hand()
                )
            )
        );
    },
    testOpenObjectInspector: function() {
        this.control.disconnect();
        this.control.addObject(this.world.openInspectorFor({a:23}));
        var patch = this.diffToEmpty();
        this.control.disconnect();
        this.patch(patch.data);
        this.assertWorldNode(
            this.div(
                this.div(
                    this.div(this.div()),
                    this.hand()
                )
            )
        );
    }
});
lively.morphic.tests.TestCase.subclass('users.cschuster.sync.tests.SyncWorldsTest',
'running', {
    setUp: function($super) {
        $super();
        this.createWorld();
        this.worldA = this.world;
        this.worldB = lively.morphic.World.createOn(document.body, new Rectangle(300,0,300,300));
        this.worldC = lively.morphic.World.createOn(document.body, new Rectangle(600,0,300,300));
        this.wcA = new users.cschuster.sync.WorkingCopy();
        this.wcA.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldA));
        this.wcB = new users.cschuster.sync.WorkingCopy();
        this.wcB.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldB));
        this.wcC = new users.cschuster.sync.WorkingCopy();
        this.wcC.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldC));
        this.wcB.autoupdate = true;
        this.wcC.autoupdate = true;
        this.sync();
    },
    tearDown: function($super) {
        this.worldB.remove();
        this.worldC.remove();
        $super();
    }
},
'helping', {
    newBox: function(width, height, id) {
        var bounds = pt(0,0).extent(pt(width, height));
        var morph = new lively.morphic.Box(bounds);
        morph.id = id;
        morph.name = id;
        return morph;
    },
    openInWorldA: function(morph) {
        this.worldA.addMorph(morph);
        this.wcA.addObject(morph);
    },
    sync: function() {
        var res = this.wcA.commit();
        if (!res) return;
        var snapshot = Object.deepCopy(this.wcA.last.data);
        this.wcB.receiveSnapshot(this.wcA.rev, snapshot);
        var patch = Object.deepCopy(this.wcA.lastPatch.data);
        this.wcC.receivePatch(this.wcA.rev, patch);
    },
    addBox: function() {
        var box = this.newBox(5, 5, "X");
        this.openInWorldA(box);
        this.sync();
        return box;
    },
},
'asserting', {
    assertSync: function(rev) {
        this.assertEquals(rev, this.wcA.rev);
        this.assertEquals(rev, this.wcB.rev);
        this.assertEquals(rev, this.wcC.rev);
        this.assertEqualState(this.wcA.last, this.wcB.last);
        this.assertEqualState(this.wcA.last, this.wcC.last);
        var a = users.cschuster.sync.Snapshot.createFromObjects(this.wcA.syncTable);
        var b = users.cschuster.sync.Snapshot.createFromObjects(this.wcB.syncTable);
        var c = users.cschuster.sync.Snapshot.createFromObjects(this.wcC.syncTable);
        this.assertEqualState(a, b);
        this.assertEqualState(a, c);
        this.assertEquals(this.wcA.syncTable.length, this.wcB.syncTable.length);
        this.assertEquals(this.wcA.syncTable.length, this.wcC.syncTable.length);
        for (var key in this.wcA.syncTable) {
            var morphA = this.wcA.syncTable[key];
            var morphB = this.wcB.syncTable[key];
            var morphC = this.wcC.syncTable[key];
            this.assertNodeMatches(morphA.renderContext().morphNode,
                                   morphB.renderContext().morphNode, true);
            this.assertNodeMatches(morphA.renderContext().morphNode,
                                   morphC.renderContext().morphNode, true);
        }
    }
},
'testing', {
    testEmptyWorlds: function() {
        this.assertSync(0);
    },
    testAddMorph: function() {
        this.addBox();
        this.assertSync(1);
    },
    testEmptyDiff: function() {
        this.addBox();
        this.assertSync(1);
        this.sync();
        this.assertSync(1);
    },
    testRemoveMorph: function() {
        var box = this.addBox();
        box.remove();
        this.wcA.removeObject(box);
        this.sync();
        this.assertSync(2);
    },
    testResize: function() {
        var box = this.addBox();
        box.setExtent(pt(10,10));
        this.sync();
        this.assertSync(2);
        box.setExtent(pt(30,30));
        this.sync();
        this.assertSync(3);
    },
    testMove: function() {
        var box = this.addBox();
        box.moveBy(pt(10,10));
        this.sync();
        this.assertSync(2);
        box.moveBy(pt(30,0));
        this.sync();
        this.assertSync(3);
    },
    testColor: function() {
        var box = this.addBox();
        box.setFill(Color.black);
        this.sync();
        this.assertSync(2);
        box.setFill(null);
        this.sync();
        this.assertSync(3);
    },
    testAddSubmorph: function() {
        var box = this.addBox();
        box.addMorph(this.newBox(3, 3, "Y"));
        this.sync();
        this.assertSync(2);
        var z = this.newBox(3, 3, "Z");
        box.addMorph(z);
        this.sync();
        this.assertSync(3);
        z.addMorph(this.newBox(3, 3, "Z"));
        this.sync();
        this.assertSync(4);
    },
    testRemoveSubmorph: function() {
        var box = this.addBox();
        var z = this.newBox(3, 3, "Z");
        box.addMorph(z);
        this.sync();
        this.assertSync(2);
        z.remove();
        this.sync();
        this.assertSync(3);
    },
    testScripts: function() {
        var box = this.addBox();
        box.addScript(function tick() { return "tack"; });
        this.sync();
        this.assertSync(2);
        box.addScript(function rot() { this.rotateBy(0.1); });
        this.sync();
        this.assertSync(3);
        box.rot();
        this.worldB.get("X").rot();
        this.worldC.get("X").rot();
        this.assertSync(3);
        debugger;
        delete box.tick;
        this.sync();
        this.assertSync(4);
        box.addScript(function rot() { this.rotateBy(2); });
        this.sync();
        this.assertSync(5);
        box.rot();
        this.worldB.get("X").rot();
        this.worldC.get("X").rot();
        this.assertSync(5);
    }
});
}) // end of module
