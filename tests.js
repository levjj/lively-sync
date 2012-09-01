module('users.cschuster.sync.tests').requires('lively.TestFramework', 'lively.morphic.tests.Helper', 'users.cschuster.sync.client').toRun(function() {

lively.morphic.tests.MorphTests.subclass('users.cschuster.sync.tests.SerializationTest',
'helping', {
    newBox: function(id, width, height, color) {
        var bounds = pt(0,0).extent(pt(width || 12, height || 8));
        var morph = new lively.morphic.Box(bounds);
        morph.id = id || "X";
        if (id) morph.name = id;
        if (color) morph.setFill(color);
        this.world.addMorph(morph);
        return morph;
    }
},
'assertions', {
    assertSerialize: function(/*args*/) {
        var table = {};
        var args = Array.from(arguments);
        for (var i = 0; i < args.length; i++) {
            table[args[i].id || "X"] = args[i];
        }
        var snapshotA = users.cschuster.sync.Snapshot.createFromObjects(table);
        var recreated = snapshotA.recreateObjects();
        for (var key in recreated) {
            if (recreated[key].isMorph) this.world.addMorph(recreated[key]);
        }
        var snapshotB = users.cschuster.sync.Snapshot.createFromObjects(recreated);
        this.assertEqualState(snapshotA, snapshotB);
    }
},
'testing', {
    testEmptyObject: function() {
        this.assertSerialize({});
    },
    testObjectWithProperties: function() {
        this.assertSerialize({a: true, b: 23, c: "foo"});
    },
    testArrays: function() {
        this.assertSerialize({a: [1,2,3], b: [["foo"], ["bar"]]});
    },
    testTwoObjects: function() {
        this.assertSerialize({id: "foo", val: 23}, {id: "bar", val: 42});
    },
    testTwoObjectsWithReferences: function() {
        var foo = {id: "foo", val: 23};
        var bar = {id: "bar", val: 42, ref: foo};
        this.assertSerialize(foo, bar);
    },
    testNestedObject: function() {
        this.assertSerialize({id: "foo", val: 23, child: {id: "bar", val: 42}});
    },
    testObjectWithCircularReferences: function() {
        var foo = {id: "foo", val: 23};
        var bar = {id: "bar", val: 42, foo: foo};
        foo.bar = bar;
        this.assertSerialize(foo, bar);
    },
    testObjectWithScript: function() {
        var obj = {a: 3};
        Object.addScript(obj, function f() { return this.a; });
        this.assertSerialize(obj);
    },
    testMorph: function() {
        this.assertSerialize(this.newBox());
    },
    testMorphWithProperties: function() {
        var morph = this.newBox();
        morph.prop = "foo";
        this.assertSerialize(morph);
    },
    testColoredMorph: function() {
        this.assertSerialize(this.newBox("X", 32, 16, Color.web.black));
    },
    testTwoMorphs: function() {
        this.assertSerialize(this.newBox("X"), this.newBox("Y"));
    },
    testTwoMorphsWithReferences: function() {
        var x = this.newBox("X");
        var y = this.newBox("Y");
        x.ref = y;
        this.assertSerialize(x, y);
    },
    testMorphWithSubmorphs: function() {
        var morph = this.newBox("X");
        morph.addMorph(this.newBox("Y"));
        morph.addMorph(this.newBox("Z"));
        this.assertSerialize(morph);
    },
    testMorphWithScripts: function() {
        var morph = this.newBox("X");
        morph.addScript(function foo() { this.moveBy(pt(12, 12)); });
        this.assertSerialize(morph);
    },
    testMorphWithSimpleConnection: function() {
        var x = this.newBox("X");
        var y = this.newBox("X");
        connect(x, "a", y, "b");
        this.assertSerialize(x, y);
    },
    testMorphWithGeometricConnection: function() {
        var x = this.newBox("X");
        var y = this.newBox("X");
        connect(x, "rotation", y, "setRotation");
        this.assertSerialize(x, y);
    },
    testPolygon: function() {
        var path = lively.morphic.Morph.makePolygon([pt(4,0), pt(4,4), pt(0,4)], 1);
        this.world.addMorph(path);
        this.assertSerialize(path);
    },
    testText: function() {
        var bounds = pt(0,0).extent(pt(40, 30));
        var text = new lively.morphic.Text(bounds, "text");
        this.world.addMorph(text);
        this.assertSerialize(text);
        text.beLabel();
        this.assertSerialize(text);
        var text = new lively.morphic.Text(bounds, "text");
        text.setFontWeight('bold');
        this.assertSerialize(text);
    },
    testPart: function() {
        this.assertSerialize(this.world.openPartItem("Rectangle", "PartsBin/Basic"));
    },
    testWorkspace: function() {
        var ws = this.world.openWorkspace();
        this.assertSerialize(ws.owner);
        ws.textString = "var f = function(x) { return x; }";
        this.assertSerialize(ws.owner);
    },
    testObjectInspector: function() {
        var box = this.newBox();
        this.assertSerialize(this.world.openInspectorFor(box), box);
    },
    testTabs: function() {
        var container = new lively.morphic.TabContainer();
        container.openInWorld();
        this.assertSerialize(container);
        var tab1 = container.addTabLabeled('New Tab');
        this.assertSerialize(container);
        container.submorphs[1].addMorph(this.newBox(40, 20, "Y", Color.web.red));
        this.assertSerialize(container);
        var tab2 = container.addTabLabeled('Another Tab');
        this.assertSerialize(container);
        container.activateTab(tab2);
        this.assertSerialize(container);
        container.submorphs[1].addMorph(this.newBox(40, 40, "Z", Color.web.green));
        this.assertSerialize(container);
        container.activateTab(tab1);
        this.assertSerialize(container);
        container.activateTab(tab2);
        this.assertSerialize(container);
    }

});

TestCase.subclass('users.cschuster.sync.tests.MappingTest',
'running', {
    setUp: function() {
        this.mapping = new users.cschuster.sync.Mapping();
        this.mapping.addRule('X', 'Y');
    }
},
'testing', {
    testMapping: function() {
        this.assertEquals('Y', this.mapping.map('X'));
        this.assertEquals(undefined, this.mapping.map('Y'));
        this.assertEquals(undefined, this.mapping.map('Z'));
        this.assertEquals('Y/a', this.mapping.map('X/a'));
        this.assertEquals('Y/b/c', this.mapping.map('X/b/c'));
    },
    testCoalesceOverlappingRules: function() {
        this.assertEqualState([{from: 'X', to: 'Y'}], this.mapping.getRules());
        this.mapping.addRule('X/a', 'Y/a');
        this.assertEquals('Y/a', this.mapping.map('X/a'));
        this.assertEqualState([{from: 'X', to: 'Y'}], this.mapping.getRules());
    },
    testDoNotCoalesceDifferentRules: function() {
        this.assertEqualState([{from: 'X', to: 'Y'}], this.mapping.getRules());
        this.mapping.addRule('X/a', 'Z');
        this.assertEquals('Z', this.mapping.map('X/a'));
        this.assertEqualState([{from: 'X', to: 'Y'},{from: 'X/a', to: 'Z'}],
                              this.mapping.getRules());
    }
});

lively.morphic.tests.MorphTests.subclass('users.cschuster.sync.tests.DiffTest',
'helper', {
    setUp: function($super) {
        $super();
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
        var patchedSnapshotA = snapshotA.clone();
        patch.apply(patchedSnapshotA);
        this.assertEqualState(patchedSnapshotA, snapshotB);
    }
},
'specs', {
    addRectPatch: function(rect, optOwner) {
        var path = optOwner ? (optOwner.id + "/submorphs/0") : rect.id;
        var width = rect.getExtent().x, height = rect.getExtent().y;
        var raw = {
            "": {submorphs:[],scripts:[],derivationIds:[],_ClipMode: "visible",
                 id:rect.id, droppingEnabled:true,halosEnabled:true,
                 __LivelyClassName__:"lively.morphic.Box",
                 __SourceModuleName__:"Global.lively.morphic.Core"},
            "/_Position": {"x":0,"y":0,__LivelyClassName__:"Point",
                __SourceModuleName__:"Global.lively.morphic.Graphics"},
            "/eventHandler": {morph:{__isSmartRef__:true,id:path},
                __LivelyClassName__:"lively.morphic.EventHandler",
                __SourceModuleName__:"Global.lively.morphic.Events"},
            "/renderContextTable": rect.renderContextTable,
            "/shape": {
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
                       _BorderWidth:1,
                       __LivelyClassName__:"lively.morphic.Shapes.Path",
                       __SourceModuleName__:"Global.lively.morphic.PathShapes"},
            "/shape/_Position": {"x":-1,"y":-1,__LivelyClassName__:"Point",
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
    testAddObject: function() {
        var snapshotA = this.serialize({});
        var snapshotB = this.serialize({X: {name: "X"}});
        this.assertPatch({X: [{name: "X"}]}, snapshotA, snapshotB);
    },
    testRemoveObject: function() {
        var snapshotA = this.serialize({X: {name: "X"}});
        var snapshotB = this.serialize({});
        this.assertPatch({X: [0,0]}, snapshotA, snapshotB);
    },
    testSimpleProperty: function() {
        var snapshotA = this.serialize({X: {name: "X"}});
        var snapshotB = this.serialize({X: {name: "X", a:23}});
        this.assertPatch({X: {a:[23]}}, snapshotA, snapshotB);
        var snapshotC = this.serialize({X: {name: "X", a:25}});
        this.assertPatch({X: {a:[25]}}, snapshotB, snapshotC);
        var snapshotD = this.serialize({X: {name: "X"}});
        this.assertPatch({X: {a:[0,0]}}, snapshotC, snapshotD);
    },
    testNumericProperties: function() {
        var snapshotA = this.serialize({X: {}});
        var snapshotB = this.serialize({X: {0: "a"}});
        this.assertPatch({X: {0:["a"]}}, snapshotA, snapshotB);
        var snapshotC = this.serialize({X: {0: "b", 1: "a"}});
        this.assertPatch({X: {0:["b"], 1: ["a"]}}, snapshotB, snapshotC);
        var snapshotD = this.serialize({X: {0: "b"}});
        this.assertPatch({X: {1:[0,0]}}, snapshotC, snapshotD);
        this.assertPatch({X: {0:["b"]}}, snapshotB, snapshotD);
    },

    testTopLevelReferences: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name:"x"}, y = {id:"y", name:"Y"}, z = {id:"Z", name:"z"};
        var table = {X:x,Y:y};
        var snapshotA = this.serialize(table);
        x.a = y;
        var snapshotB = this.serialize(table);
        this.assertPatch({X: {a:ref("Y")}}, snapshotA, snapshotB);
        table.Z = z;
        var snapshotC = this.serialize(table);
        this.assertPatch({Z: [{id: "Z", name: "z"}]}, snapshotB, snapshotC);
        x.a = z;
        var snapshotD = this.serialize(table);
        this.assertPatch({X: {a:{id:["Z"]}}}, snapshotC, snapshotD);
        this.assertPatch({X: {a:{id:["Z"]}}, Z: [{id: "Z", name:"z"}]}, snapshotB, snapshotD);
    },
    testNestedPrimitiveReferences: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {name:"x"}, y = {name:"y"}, z = {name:"z"};
        var snapshotA = this.serialize({X:x});
        x.a = y;
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/a": [{name:"y"}]}, snapshotA, snapshotB);
        x.b = z;
        var snapshotC = this.serialize({X:x});
        this.assertPatch({"X/b": [{name:"z"}]}, snapshotB, snapshotC);
        this.assertPatch({"X/a": [{name:"y"}], "X/b": [{name:"z"}]}, snapshotA, snapshotC);
        x.a = z;
        var snapshotD = this.serialize({X:x});
        var expected = {X:{b:{id:["X/a"]}},"X/a": {name: ["z"]}, "X/b":[0,0]};
        this.assertPatch(expected, snapshotC, snapshotD);
        this.assertPatch({X:{b:ref("X/a")}, "X/a": {name: ["z"]}}, snapshotB, snapshotD);
    },
    testNestedReferences: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y"}, z = {id:"Z", name: "z"};
        var snapshotA = this.serialize({X:x});
        x.a = y;
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/a": [{id:"Y", name: "y"}]}, snapshotA, snapshotB);
        x.b = z;
        var snapshotC = this.serialize({X:x});
        this.assertPatch({"X/b": [{id:"Z", name: "z"}]}, snapshotB, snapshotC);
        this.assertPatch({"X/a": [{id:"Y", name: "y"}], "X/b": [{id:"Z", name: "z"}]},
                         snapshotA, snapshotC);
        x.c = y;
        var snapshotD = this.serialize({X:x});
        this.assertPatch({"X": {c: ref("X/a")}}, snapshotC, snapshotD);
        delete x.a;
        var snapshotE = this.serialize({X:x});
        this.assertPatch({"X/c": ["X/a", {}, 0]}, snapshotD, snapshotE);
        x.a = y;
        var snapshotF = this.serialize({X:x});
        this.assertPatch({X: {c: ref("X/a")}, "X/a": ["X/c",{},0]}, snapshotE, snapshotF);
    },
    testNestedReferencesWithPrimitiveProperties: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y", p: {}};
        var snapshotA = this.serialize({X:x});
        x.b = y;
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/b": [{id:"Y", name: "y"}], "X/b/p": [{}]}, snapshotA, snapshotB);
        x.a = y;
        var snapshotC = this.serialize({X:x});
        var expected = {};
        expected["X"]   = {b: ref("X/a")}; // X.b now points to ref(X/a)
        expected["X/a"] = ["X/b", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotC);
        delete x.b;
        var snapshotD = this.serialize({X:x});
        var expected = {"X/a": ["X/b", {}, 0]}; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotD);
    },
    testNestedReferencesWithProperties: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y", p: {id: "Z", name: "z"}};
        var snapshotA = this.serialize({X:x});
        x.b = y;
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/b": [{id:"Y", name: "y"}], "X/b/p": [{id: "Z", name: "z"}]},
                         snapshotA, snapshotB);
        x.a = y;
        var snapshotC = this.serialize({X:x});
        var expected = {};
        expected["X"]   = {b: ref("X/a")}; // X.b now points to ref(X/a)
        expected["X/a"] = ["X/b", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotC);
        delete x.b;
        var snapshotD = this.serialize({X:x});
        var expected = {};
        expected["X/a"] = ["X/b", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotD);
    },
    testNestedReferencesWithNestedProperties: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y", p:
            {id: "P", name: "p", q: {id: "Q", name: "q"}}};
        var snapshotA = this.serialize({X:x});
        x.b = y;
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/b": [{id:"Y", name: "y"}],
                          "X/b/p": [{id: "P", name: "p"}],
                          "X/b/p/q": [{id: "Q", name: "q"}]},
                         snapshotA, snapshotB);
        x.a = y;
        var snapshotC = this.serialize({X:x});
        var expected = {};
        expected["X"]   = {b: ref("X/a")}; // X.b now points to ref(X/a)
        expected["X/a"] = ["X/b", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotC);
        delete x.b;
        var snapshotD = this.serialize({X:x});
        var expected = {};
        expected["X/a"] = ["X/b", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotB, snapshotD);
    },
    testNestedReferencesMoveNestedProperties: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y"}, z = {id:"Z", name: "z"};
        var snapshotA = this.serialize({Y:y});
        y.a = z;
        var snapshotB = this.serialize({Y:y});
        this.assertPatch({"Y/a": [{id: "Z", name: "z"}]}, snapshotA, snapshotB);
        x.a = z;
        var snapshotC = this.serialize({X:x,Y:y});
        var expected = {};
        expected["X"]   = [{id: "X", name: "x"}]; // X.b now points to ref(X/a)
        expected["X/a"] = ["Y/a", {}, 0]; // copy Y/a to X/a
        expected["Y"] = {a: ref("X/a")};
        this.assertPatch(expected, snapshotB, snapshotC);
        var snapshotD = this.serialize({Y:y});
        var expected = {};
        expected["X"] = [0, 0];
        expected["Y/a"] = ["X/a", {}, 0]; // copy X/b to X/a
        this.assertPatch(expected, snapshotC, snapshotD);
    },
    testWrapObject: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x"};
        var snapshotA = this.serialize({X:x});
        var y = {id:"Y", name: "y", a: x};
        var snapshotB = this.serialize({Y:y});
        var expected = {"Y": [{id: "Y", name: "y"}], "Y/a": ["X", {}, 0]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testArrayWithPrimitiveReferences: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {name:"x",a:[]}, y = {name:"y"}, z = {name:"z"};
        var snapshotA = this.serialize({X:x});
        x.a.push(y);
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/a/0": [{name:"y"}]}, snapshotA, snapshotB);
        x.a.push(z);
        var snapshotC = this.serialize({X:x});
        this.assertPatch({"X/a/1": [{name:"z"}]}, snapshotB, snapshotC);
        this.assertPatch({"X/a/0": [{name:"y"}], "X/a/1": [{name:"z"}]}, snapshotA, snapshotC);
        x.a[0] = z;
        var snapshotD = this.serialize({X:x});
        var expected = {"X":{a:{1:{id:["X/a/0"]}}},"X/a/0":{name:["z"]},"X/a/1":[0,0]};
        this.assertPatch(expected, snapshotC, snapshotD);
        x.a.removeAt(0);
        x.a[0] = y;
        var snapshotE = this.serialize({X:x});
        var expected = {"X/a/0":{name:["y"]},"X": {a: {1: [0,0]}}};
        this.assertPatch(expected, snapshotD, snapshotE);
        x.a.removeAt(0);
        var snapshotE = this.serialize({X:x});
        this.assertPatch({"X":{a:{1:[0,0]}}, "X/a/0": [0, 0]}, snapshotD, snapshotE);
    },
    testArrayWithReferences: function() {
        function ref(id) { return [{__isSmartRef__: true, id: id}]; }
        var x = {id:"X", name: "x", a: []}, y = {id:"Y", name: "y"}, z = {id:"Z", name: "z"};
        var snapshotA = this.serialize({X:x});
        x.a.push(y);
        var snapshotB = this.serialize({X:x});
        this.assertPatch({"X/a/0": [{id: "Y", name:"y"}]}, snapshotA, snapshotB);
        x.a.push(z);
        var snapshotC = this.serialize({X:x});
        this.assertPatch({"X/a/1": [{id: "Z", name:"z"}]}, snapshotB, snapshotC);
        this.assertPatch({"X/a/0": [{id: "Y", name:"y"}], "X/a/1": [{id: "Z", name:"z"}]}, snapshotA, snapshotC);
        x.a[0] = z;
        var snapshotD = this.serialize({X:x});
        var expected = {"X":{a:{1:ref("X/a/0")}},"X/a/0":["X/a/1", {}, 0]};
        this.assertPatch(expected, snapshotC, snapshotD);
        x.a.pop();
        var snapshotD2 = this.serialize({X:x});
        var expected = {"X/a/0":["X/a/1", {}, 0]};
        this.assertPatch(expected, snapshotC, snapshotD2);
        x.a.push(z);
        x.a[0] = y;
        var snapshotE = this.serialize({X:x});
        var expected = {"X": {a: {0: {id: ["X/a/0"]}}},
                        "X/a/0":[{id: "Y", name: "y"}],
                        "X/a/1": ["X/a/0", {}, 0]};
        this.assertPatch(expected, snapshotD, snapshotE);
        x.a.removeAt(0);
        var snapshotF = this.serialize({X:x});
        this.assertPatch({"X/a/0": ["X/a/1", {}, 0]}, snapshotE, snapshotF);
    },
    newMethod: function() {
        // enter comment here
    },

    testUnwrapObject: function() {
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y"};
        x.a = y;
        var snapshotA = this.serialize({X:x});
        delete x.a;
        var snapshotB = this.serialize({Y:y});
        var expected = {"X": [0,0], "Y": ["X/a", {}, 0]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testMultipleNestedMovesAtOnce: function() {
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y"}, z = {id:"Z", name:"z"};
        x.a = y;
        y.b = z;
        var snapshotA = this.serialize({X:x});
        delete x.a;
        delete y.b;
        var snapshotB = this.serialize({X:x, Y:y, Z:z});
        var expected = {"Y": ["X/a", {}, 0], "Z": ["X/a/b", {}, 0]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testMultipleNestedMovesWithEditsAtOnce: function() {
        var x = {id:"X", name: "x"}, y = {id:"Y", name: "y"}, z = {id:"Z", name:"z"};
        x.a = y;
        y.b = z;
        var snapshotA = this.serialize({X:x});
        x.n = 23;
        y.n = 42;
        z.n = 69;
        delete x.a;
        delete y.b;
        var snapshotB = this.serialize({X:x, Y:y, Z:z});
        var expected = {"X": {n: [23]}, "Y": ["X/a", {n: [42]}, 0], "Z": ["X/a/b", {n: [69]}, 0]};
        this.assertPatch(expected, snapshotA, snapshotB);
    },
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
    testBorderColor: function() {
        this.rect.setBorderColor(Color.black);
        this.rect.savedColor = Color.web.salmon.lighter();
        var snapshotA = this.serialize(this.table);
        this.rect.setBorderColor(this.rect.savedColor);
        var snapshotB = this.serialize(this.table);
        this.assertPatch(snapshotA, snapshotB);
        delete this.rect.savedColor;
        var snapshotC = this.serialize(this.table);
        this.assertPatch(snapshotB, snapshotC);
        this.assertPatch(snapshotA, snapshotC);
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
    testRemoveTwoSubmorphs: function() {
        var bounds = pt(0,0).extent(pt(20,20));
        var submorph1 = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph1);
        var submorph2 = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorph2);
        var snapshotA = this.serialize(this.table);
        this.rect.removeMorph(submorph1);
        this.rect.removeMorph(submorph2);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/submorphs/0"] = [0,0];
        expected[this.rect.id + "/submorphs/1"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testSwapSubmorphs: function() {
        var bounds = pt(0,0).extent(pt(20,20));
        var submorphA = new lively.morphic.Box(bounds);
        var submorphB = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorphA);
        this.rect.addMorph(submorphB);
        var snapshotA = this.serialize(this.table);
        submorphA.remove();
        this.rect.addMorph(submorphA);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/submorphs/0"] = [this.rect.id + "/submorphs/1", {}, 0];
        expected[this.rect.id + "/submorphs/1"] = [this.rect.id + "/submorphs/0", {}, 0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testSwapNestedSubmorphs: function() {
        var otherMorph = new lively.morphic.Box(pt(0,0).extent(pt(20,20)));
        var submorph = new lively.morphic.Box(pt(0,0).extent(pt(20,20)));
        this.rect.addMorph(submorph);
        this.table[otherMorph.id] = otherMorph;
        var snapshotA = this.serialize(this.table);
        otherMorph.addMorph(submorph);
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[otherMorph.id + "/submorphs/0"] = [this.rect.id + "/submorphs/0", {
            _Rotation: [0], _Scale: [1], owner: {id: [otherMorph.id]}
        }, 0];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testSwapSubmorphsWithEdits: function() {
        var bounds = pt(0,0).extent(pt(20,20));
        var submorphA = new lively.morphic.Box(bounds);
        var submorphB = new lively.morphic.Box(bounds);
        this.rect.addMorph(submorphA);
        this.rect.addMorph(submorphB);
        var snapshotA = this.serialize(this.table);
        submorphA.remove();
        this.rect.addMorph(submorphA);
        submorphA.halosEnabled = false;
        submorphB.droppingEnabled = false;
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id + "/submorphs/0"] = [this.rect.id + "/submorphs/1", {droppingEnabled: [false]}, 0];
        expected[this.rect.id + "/submorphs/1"] = [this.rect.id + "/submorphs/0", {halosEnabled: [false]}, 0];
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
    },
    testSimpleConnect: function() {
        this.rect.a = 0.5;
        this.rect.b = 0.5;
        var snapshotA = this.serialize(this.table);
        connect(this.rect, "a", this.rect, "b");
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id] = {attributeConnections:[[]],
                                  doNotCopyProperties:[["$$a"]],doNotSerialize:[["$$a"]]};
        expected[this.rect.id + "/attributeConnections/0"] = [{
            sourceAttrName:"a",sourceObj:{__isSmartRef__:true,id:this.rect.id},
            targetMethodName:"b",targetObj:{__isSmartRef__:true,id:this.rect.id},
            __LivelyClassName__:"AttributeConnection",
            __SourceModuleName__:"Global.lively.bindings"}];
        this.assertPatch(expected, snapshotA, snapshotB);
    },
    testSimpleDisconnect: function() {
        connect(this.rect, 'a', this.rect, 'b');
        this.rect.a = 2;
        var snapshotA = this.serialize(this.table);
        disconnect(this.rect, 'a', this.rect, 'b');
        var snapshotB = this.serialize(this.table);
        var expected = {};
        expected[this.rect.id] = {attributeConnections: [0,0],
                                  doNotCopyProperties: [0,0],
                                  doNotSerialize: [0,0]};
        expected[this.rect.id + "/attributeConnections/0"] = [0,0];
        this.assertPatch(expected, snapshotA, snapshotB);
    }
});
lively.morphic.tests.MorphTests.subclass('users.cschuster.sync.tests.MorphPatchTest',
'running', {
    setUp: function($super) {
        $super();
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
        this.assertNoSourceModuleNames();
        this.assertArraysHaveNoMethods();
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
        return this.div(this.div());
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
    },
    assertNoSourceModuleNames: function() {
        for (var i = 0; i < this.world.submorphs.length; i++) {
            var m = this.world.submorphs[i];
            this.assert(!m.hasOwnProperty("__LivelyClassName__"));
            this.assert(!m.hasOwnProperty("__SourceModuleName__"));
        }
    },
    assertArraysHaveNoMethods: function() {
        for (var i = 0; i < this.world.submorphs.length; i++) {
            var m = this.world.submorphs[i];
            for (var key in m) {
                var v = m[key];
                if (m.hasOwnProperty(key) && Array.isArray(v)) {
                    this.assert(!v.hasOwnProperty("each"));
                }
            }
        }        
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
    addPolygonPatch: users.cschuster.sync.tests.DiffTest.prototype.addPolygonPatch,
    connectPatch: {"X":{attributeConnections: [[]],
                        doNotCopyProperties: [["$$a"]], doNotSerialize: [["$$a"]]},
                   "X/attributeConnections/0": [{
                        sourceAttrName: "a", sourceObj: {__isSmartRef__:true, id: "X"},
                        targetMethodName:"b", targetObj: {__isSmartRef__:true, id: "X"},
                        __LivelyClassName__: "AttributeConnection",
                        __SourceModuleName__: "Global.lively.bindings"}]},
    disconnectPatch: {"X": {attributeConnections: [0,0],
                            doNotCopyProperties: [0,0],
                            doNotSerialize: [0,0]},
                      "X/attributeConnections/0": [0,0]}
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
    },
    testSimpleConnect: function() {
        this.morph.a = 2;
        this.morph.b = 4;
        this.patch(this.connectPatch);
        this.morph.a = 3;
        this.assertEquals(3, this.morph.b);
    },
    testSimpleDisconnect: function() {
        connect(this.morph, 'a', this.morph, 'b');
        this.morph.a = 2;
        this.patch(this.disconnectPatch);
        this.morph.a = 3;
        this.assertEquals(2, this.morph.b);
        this.assert(!this.morph.hasOwnProperty('attributeConnections'));
        this.assert(!this.morph.hasOwnProperty('$$a'));
    }
});

lively.morphic.tests.MorphTests.subclass('users.cschuster.sync.tests.SyncTest',
'running', {
    setUp: function($super) {
        $super();
        this.oldIdFunc = lively.newId;
        lively.newId = function() { return 23; };
        this.worldA = this.world;
        this.worldB = lively.morphic.World.createOn(document.body, new Rectangle(300,0,300,300));
        this.worldC = lively.morphic.World.createOn(document.body, new Rectangle(600,0,300,300));
        lively.morphic.World.currentWorld = this.worldA;
        this.wcA = new users.cschuster.sync.WorkingCopy();
        this.wcA.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldA));
        this.wcB = new users.cschuster.sync.WorkingCopy();
        this.wcB.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldB));
        this.wcC = new users.cschuster.sync.WorkingCopy();
        this.wcC.addPlugin(new users.cschuster.sync.MorphPlugin(this.worldC));
        this.wcB.autoupdate = true;
        this.wcC.autoupdate = true;
        this.wcA.addObject(this.worldA.firstHand());
        this.snapshots = [users.cschuster.sync.Snapshot.empty()];
        this.sync();
    },
    tearDown: function($super) {
        this.worldB.remove();
        this.worldC.remove();
        $super();
        lively.newId = this.oldIdFunc;
    }
},
'helping', {
    newBox: function(width, height, id, color) {
        if (!color) color = Color.web.blue;
        var bounds = pt(0,0).extent(pt(width, height));
        var morph = new lively.morphic.Box(bounds);
        morph.id = id;
        morph.name = id;
        morph.setFill(color);
        return morph;
    },
    openInWorldA: function(morph) {
        this.worldA.addMorph(morph);
        this.wcA.addObject(morph);
        return morph;
    },
    sync: function() {
        var res = this.wcA.commit();
        if (!res) return;
        var snapshot = Object.deepCopy(this.wcA.last.data);
        this.wcB.receiveSnapshot(this.wcA.rev, snapshot);
        var patch = Object.deepCopy(this.wcA.lastPatch.data);
        this.wcC.receivePatch(this.wcA.rev, patch);
        this.snapshots[this.wcA.rev] = this.wcA.last;
    },
    addBox: function(optID) {
        var box = this.newBox(5, 5, optID || "X");
        this.openInWorldA(box);
        this.sync();
        return box;
    },
},
'asserting', {
    assertSync: function(rev, dirty) {
        if (!dirty) this.sync();
        this.assertEquals(rev, this.wcA.rev);
        this.assertEquals(rev, this.wcB.rev);
        this.assertEquals(rev, this.wcC.rev);
        this.assertEqualState(this.wcA.last, this.wcB.last);
        this.assertEqualState(this.wcA.last, this.wcC.last);
        this.assertPatchingPreviousSnapshots(rev);
    },
    assertPatchingPreviousSnapshots: function(rev) {
        for (var i = 0; i < rev - 2; i++) {
            var copy = this.snapshots[i].clone();
            var patch = copy.diff(this.wcA.last).toPatch();
            patch.apply(copy);
            this.assertEqualState(copy, this.wcA.last);
        }
    }
});

users.cschuster.sync.tests.SyncTest.subclass('users.cschuster.sync.tests.SyncPrimitivesTest',
'asserting', {
    assertSync: function($super, rev, dirty, ignoreDOM) {
        $super(rev, dirty);
        var snapshot = users.cschuster.sync.Snapshot.createFromObjects(this.wcA.syncTable);
        if (!dirty) this.assertEqualState(snapshot, this.wcA.last);
        this.assertIdenticalToSnapshot(snapshot, this.wcB.syncTable);
        this.assertIdenticalToSnapshot(snapshot, this.wcC.syncTable);
        if (!ignoreDOM) {
            this.assertIdenticalDOM(this.wcA.syncTable, this.wcB.syncTable);
            this.assertIdenticalDOM(this.wcA.syncTable, this.wcC.syncTable);
        }
        this.assertHandsInFront(this.worldA);
        this.assertHandsInFront(this.worldB);
        this.assertHandsInFront(this.worldC);
    },
    assertIdenticalToSnapshot: function(leftSnapshot, rightTable) {
        var rightSnapshot = users.cschuster.sync.Snapshot.createFromObjects(rightTable);
        this.assertEqualState(leftSnapshot, rightSnapshot);
    },
    assertIdenticalDOM: function(leftTable, rightTable) {
        this.assertEquals(Object.keys(leftTable).length, Object.keys(rightTable).length);
        for (var key in leftTable) {
            this.assertNodeMatches(leftTable[key].renderContext().morphNode,
                                   rightTable[key].renderContext().morphNode, true);
        }
    },
    assertPatchingPreviousSnapshots: function(rev) {
        for (var i = 0; i < rev - 2; i++) {
            var copy = this.snapshots[i].clone();
            var patch = copy.diff(this.wcA.last).toPatch();
            patch.apply(copy);
            this.assertEqualState(copy, this.wcA.last);
        }
    },
    assertHandsInFront: function(world) {
        // hands must be rendered in front of other morphs which
        // means that they must come last in the submorphs array of the world
        var seenAHand = false;
        for (var i = 0; i < world.submorphs.length; i++) {
            if (!seenAHand) {
                if (world.submorphs[i].isHand) seenAHand = true;
            } else {
                this.assert(world.submorphs[i].isHand);
            }
        }
    }
},
'testing', {
    testEmptyWorlds: function() {
        this.assertSync(1);
    },
    testAddMorph: function() {
        this.addBox();
        this.assertSync(2);
    },
    testEmptyDiff: function() {
        this.addBox();
        this.assertSync(2);
        this.sync();
        this.assertSync(2);
    },
    testRemoveMorph: function() {
        var box = this.addBox();
        box.remove();
        this.wcA.removeObject(box);
        this.assertSync(3);
    },
    testSimpleProperty: function() {
        var box = this.addBox();
        box.a = 23;
        this.assertSync(3);
        box.a = 25;
        this.assertSync(4);
        delete box.a;
        this.assertSync(5);
    },
    testTopLevelReference: function() {
        var x = this.addBox("X"), y = this.addBox("Y"), z = this.addBox("Z");
        x.a = y;
        this.assertSync(5);
        x.b = z;
        this.assertSync(6);
        x.a = z;
        this.assertSync(7);
        delete x.b;
        this.assertSync(8);
    },
    testNestedReferences: function() {
        var x = this.addBox("X"), y = this.newBox(1, 2, "Y"), z = this.newBox(3, 4, "Z");
        x.a = y;
        this.assertSync(3);
        x.b = z;
        this.assertSync(4);
        x.c = y;
        this.assertSync(5);
        delete x.a;
        this.assertSync(6);
        x.a = y;
        this.assertSync(7);
    },
    testWrap: function() {
        var x = this.addBox("X");
        this.wcA.removeObject(x);
        var y = this.openInWorldA(this.newBox(20, 30, "Y"));
        y.addMorph(x);
        this.assertSync(3);
    },
    testUnwrapObject: function() {
        var x = this.addBox("X");
        var y = this.newBox(20, 30, "Y");
        x.addMorph(y);
        this.assertSync(3);
        this.openInWorldA(y);
        this.assertSync(4);
    },
    testMultipleUnwrapsAtOnce: function() {
        var x = this.addBox("X");
        var y = this.newBox(20, 30, "Y");
        var z = this.newBox(20, 30, "Y");
        x.addMorph(y);
        y.addMorph(z);
        this.assertSync(3);
        this.openInWorldA(y);
        this.openInWorldA(z);
        this.assertSync(4);
    },
    testArray: function() {
        var x = this.addBox(), y = this.newBox(1, 2, "Y"), z = this.newBox(3, 4, "Z");
        x.a = [];
        this.assertSync(3);
        x.a.push(y);
        this.assertSync(4);
        x.a.push(z);
        this.assertSync(5);
        x.a[0] = z;
        this.assertSync(6);
        x.a[0] = y;
        this.assertSync(7);
        x.a.removeAt(0);
        this.assertSync(8);
    },
    testResize: function() {
        var box = this.addBox();
        box.setExtent(pt(10,10));
        this.assertSync(3);
        box.setExtent(pt(30,30));
        this.assertSync(4);
    },
    testMove: function() {
        var box = this.addBox();
        box.moveBy(pt(10,10));
        this.assertSync(3);
        box.moveBy(pt(30,0));
        this.assertSync(4);
    },
    testColor: function() {
        var box = this.addBox();
        box.setFill(Color.black);
        this.assertSync(3);
        box.setFill(null);
        this.assertSync(4);
    },
    testBorderColor: function() {
        var box = this.addBox();
        box.setBorderColor(Color.black);
        this.assertSync(3);
        box.savedColor = Color.web.salmon.lighter();
        this.assertSync(4);
        box.setBorderColor(box.savedColor);
        this.assertSync(5);
    },
    testAddSubmorph: function() {
        var box = this.addBox();
        box.addMorph(this.newBox(3, 3, "Y"));
        this.assertSync(3);
        var z = this.newBox(3, 3, "Z");
        box.addMorph(z);
        this.assertSync(4);
        z.addMorph(this.newBox(3, 3, "Z"));
        this.assertSync(5);
    },
    testRemoveSubmorph: function() {
        var box = this.addBox();
        var z = this.newBox(3, 3, "Z");
        box.addMorph(z);
        this.assertSync(3);
        z.remove();
        this.assertSync(4);
    },
    testSwapSubmorphs: function() {
        var box = this.addBox();
        var y = this.newBox(3, 1, "Y");
        var z = this.newBox(3, 2, "Z");
        box.addMorph(y);
        box.addMorph(z);
        this.assertSync(3);
        y.remove();
        box.addMorph(y);
        this.assertSync(4);
        z.remove();
        box.addMorph(z);
        y.setClipMode("auto");
        y.setFill(Color.red);
        z.setBorderWidth(13);
        this.assertSync(5);
    },
    testScripts: function() {
        var box = this.addBox();
        box.addScript(function tick() { return "tack"; });
        this.assertSync(3);
        box.addScript(function rot() { this.rotateBy(0.1); });
        this.assertSync(4);
        box.rot();
        this.worldB.get("X").rot();
        this.worldC.get("X").rot();
        this.assertSync(4, true);
        this.assertSync(5);
        delete box.tick;
        this.assertSync(6);
        box.addScript(function rot() { this.rotateBy(2); });
        this.assertSync(7);
        box.rot();
        this.worldB.get("X").rot();
        this.worldC.get("X").rot();
        this.assertSync(7, true);
        this.assertSync(8);
    },
    testSimpleConnect: function() {
        var box = this.addBox();
        box.a = 2;
        box.b = 4;
        connect(box, "a", box, "b");
        this.assertSync(3);
        box.a = 3;
        this.assertEquals(3, box.b);
        this.worldB.get("X").a = 3;
        this.assertEquals(3, this.worldB.get("X").b);
        this.worldC.get("X").a = 3;
        this.assertEquals(3, this.worldC.get("X").b);
        this.assertSync(3, true);
        this.assertSync(4);
        box.a = 5;
        this.assertSync(5);
    },
    testGeometryConnect: function() {
        var box = this.addBox();
        box.bar = 0;
        box.addScript(function foo(rot) { this.bar = rot; });
        connect(box, "rotation", box, "foo");
        this.assertSync(3);
        box.rotateBy(1);
        this.assertEquals(1, box.bar);
        this.worldB.get("X").rotateBy(1);
        this.assertEquals(1, this.worldB.get("X").bar);
        this.worldC.get("X").rotateBy(1);
        this.assertEquals(1, this.worldC.get("X").bar);
        this.assertSync(3, true);
        this.assertSync(4);
        box.rotateBy(1);
        this.assertSync(5);
    },
    testMultipleConnections: function() {
        var boxX = this.addBox("X"), boxY = this.addBox("Y");
        boxX.a = 2;
        boxX.addScript(function b(v) { this.c = v + 1; });
        this.assertSync(4);
        connect(boxX, "a", boxX, "b");
        this.assertSync(5);
        connect(boxX, "a", boxY, "a");
        this.assertSync(6);
        boxX.a = 3;
        this.assertSync(7);
        disconnect(boxX, "a", boxX, "b");
        this.assertSync(8);
        boxX.a = 8;
        this.assertSync(9);
        disconnect(boxX, "a", boxY, "a")
        this.assertSync(10);
    },
    testDragAndDrop: function() {
        var box = this.addBox();
        var h = this.worldA.firstHand();
        h.grabMorph(box);
        this.wcA.removeObject(box);
        this.assertSync(3);
        h.setPosition(pt(400,100));
        this.assertSync(4);
        h.dropContentsOn(this.worldA, {stop: Functions.Null});
        for (var i = 0; i < this.worldA.submorphs.length; i++) {
            this.wcA.addObject(this.worldA.submorphs[i]);
        }
        this.assertSync(5);
    },
    testDragAndDropSubmorph: function() {
        var boxX = this.addBox("X");
        var boxY = this.addBox("Y");
        boxY.moveBy(pt(10, 0));
        var boxZ = this.newBox(3, 3, "Z", Color.web.white);
        boxX.addMorph(boxZ);
        boxZ.moveBy(pt (1, 1));
        this.assertSync(4);
        var h = this.worldA.firstHand();
        h.grabMorph(boxZ);
        this.assertSync(5);
        h.setPosition(pt(12,0));
        this.assertSync(6);
        h.dropContentsOn(boxY, {stop: Functions.Null});
        this.assertSync(7);
    },
    testDragAndDropParentMorph: function() {
        var box = this.addBox("X");
        box.addMorph(this.newBox(3, 3, "Z", Color.web.white));
        this.assertSync(3);
        var h = this.worldA.firstHand();
        h.grabMorph(box);
        this.wcA.removeObject(box);
        this.assertSync(4);
        h.setPosition(pt(12,0));
        this.assertSync(5);
        h.dropContentsOn(this.worldA, {stop: Functions.Null});
        this.assertSync(6);
    },
    testText: function() {
        var bounds = pt(0,0).extent(pt(40, 30));
        var text = new lively.morphic.Text(bounds, "text");
        this.openInWorldA(text);
        this.assertSync(2);
        text.textString += "2";
        this.assertSync(3);
        text.replaceTextString("text3");
        this.assertSync(4);
        text.insertTextStringAt(2, "s");
        this.assertSync(5);
        text.insertRichTextAt("o", {color: Color.web.red}, 4);
        this.assertSync(6);
        text.toggleBoldness(1, 2);
        this.assertSync(7);
        text.setTextColor(Color.web.green);
        this.assertSync(8);
        text.replaceTextString("text4");
        this.assertSync(9);
    },
    testOpenPart: function() {
        var rect = this.worldA.openPartItem("Rectangle", "PartsBin/Basic");
        this.wcA.addObject(rect);
        this.assertSync(2);
    },
    testWindow: function() {
        var box = this.newBox(80, 40, "X", Color.web.red);
        this.worldA.internalAddWindow(box, box.name, pt(10, 10));
        var window = box.owner;
        this.wcA.addObject(window);
        /* The label of the window title bar is broken
           with regard to fixedWidth and setMinWidth
           this.assertSync(3); */
        this.assertSync(2, false, true);
        window.toggleCollapse();
        this.assertSync(3, false, true);
        window.toggleCollapse();
        this.assertSync(4, false, true);
        window.remove();
        this.wcA.removeObject(window);
        this.assertSync(5);
    },
    testTabs: function() {
        var container = new lively.morphic.TabContainer();
        this.openInWorldA(container);
        this.assertSync(2);
        var tab1 = container.addTabLabeled('New Tab');
        this.assertSync(3, false, true);
        container.submorphs[1].addMorph(this.newBox(40, 20, "Y", Color.web.red));
        this.assertSync(4, false, true);
        var tab2 = container.addTabLabeled('Another Tab');
        this.assertSync(5, false, true);
        container.activateTab(tab2);
        this.assertSync(6, false, true);
        container.submorphs[1].addMorph(this.newBox(40, 40, "Z", Color.web.green));
        this.assertSync(7, false, true);
        container.activateTab(tab1);
        this.assertSync(8, false, true);
        container.activateTab(tab2);
        this.assertSync(9, false, true);
    },
    testMenu: function() {
        function evt(x,y) { return {getPosition: function() { return pt(x,y); }}};
        var box = this.newBox(40, 20, "X", Color.web.blue);
        this.worldA.currentMenu = box;
        this.openInWorldA(box);
        this.assertSync(2);
        this.worldA.firstHand().removeOpenMenu(evt(10,10)); // inside: nothing should happen
        this.assertSync(2);
        this.worldA.firstHand().removeOpenMenu(evt(10,30)); // outside: remove menu
        this.wcA.removeObject(box);
        this.assertSync(3);
    },
});

users.cschuster.sync.tests.SyncTest.subclass('users.cschuster.sync.tests.WorkFlowTest',
'testing', {
    testTextEditing: function() {
        var ws = this.worldA.openWorkspace();
        this.wcA.addObject(ws.owner);
        this.assertSync(2);
        ws.textString = "var f = function(x) { return x; }";
        this.assertSync(3);
    },
    testInspecting: function() {
        var insp = this.worldA.openInspectorFor(this.addBox());
        this.wcA.addObject(insp);
        this.assertSync(3);
    },
    testStyleEditor: function() {
        var editor = this.worldA.openStyleEditorFor(this.addBox());
        this.wcA.addObject(editor);
        this.assertSync(3);
    },
    testPartsBin: function() {
        var partsBin = this.worldA.openPartItem('PartsBinBrowser', 'PartsBin/Tools', false);
        this.wcA.addObject(partsBin);
        this.assertSync(2);
    },
    testChineseCheckers: function() {
        var game = this.worldA.openPartItem('ChineseCheckers', 'PartsBin/Games', false);
        this.wcA.addObject(game);
        this.assertSync(2);
    }

});

users.cschuster.sync.tests.SyncTest.subclass('users.cschuster.sync.tests.InteractionTest',
'asserting', {
    assertSync: function($super) {
        $super(this.rev++, false);
    },
    assertProperty: function(expected, morph, prop) {
        this.assertEqualState(expected, morph[prop]());
        this.assertEqualState(expected, this.morphInB(morph)[prop]());
        this.assertEqualState(expected, this.morphInC(morph)[prop]());
    },
    assertMorphPosition: function(x, y) {
        this.assertProperty(pt(x, y), this.morph, "getPosition");
    },
    assertHandPosition: function(x, y) {
        this.assertProperty(pt(x, y), this.worldA.firstHand(), "getPosition");
    }
},
'running', {
    setUp: function($super) {
        $super();
        this.morph = this.newBox(20, 20, "X", Color.web.yellow);
        this.openInWorldA(this.morph);
        this.rev = 2;
        this.assertSync();
    }
},
'helping', {
    morphInB: function(morph) {
        if (!morph) morph = this.morph;
        return this.worldB.get(morph.name);
    },
    morphInC: function(morph) {
        if (!morph) morph = this.morph;
        return this.worldC.get(morph.name);
    },
    grabMaster: function() {
        var h = this.worldA.firstHand();
        h.grabMorph(this.morph);
        this.wcA.removeObject(this.morph);
    },
    grabSlave: function() {
        var h = this.worldC.firstHand();
        h.grabMorph(this.morphC());
    },
    moveMaster: function(x, y) {
        this.worldA.firstHand().setPosition(pt(x, y));
    },
    moveSlave: function(x, y) {
        this.worldC.firstHand().setPosition(pt(x, y));
    },
    dropOnMaster: function(otherMorph) {
        var h = this.worldA.firstHand();
        h.dropContentsOn(otherMorph, {stop: Functions.Null});
    },
    dropOnWorldMaster: function() {
        this.dropOnMaster(this.worldA);
        this.wcA.addObject(this.morph);
    },
    dropOnSlave: function(otherMorph) {
        var h = this.worldC.firstHand();
        h.dropContentsOn(otherMorph, {stop: Functions.Null});
    },
},
'testing', {
    testMasterMovesMorphAroundFastSync: function() {
        this.moveMaster(5, 5);
                                  this.assertSync();
                                  this.assertHandPosition(5, 5);
        this.grabMaster();
                                  this.assertSync();
        this.moveMaster(45, 15);
                                  this.assertSync();
                                  this.assertHandPosition(45, 15);
                                  this.assertMorphPosition(-5, -5);
        this.dropOnWorldMaster();
                                  this.assertSync();
                                  this.assertMorphPosition(40, 10);
        this.moveMaster(15, 60);
                                  this.assertSync();
                                  this.assertHandPosition(15, 60);
    },
    testMasterMovesMorphAroundSlowSync: function() {
        this.moveMaster(5, 5);
        this.grabMaster();
        this.moveMaster(45, 15);
        this.dropOnWorldMaster();
        this.moveMaster(15, 60);
                                  this.assertSync();
                                  this.assertHandPosition(15, 60);
                                  this.assertMorphPosition(40, 10);
    },
    testMasterRotatesAndReziesFastSync: function() {
        this.morph.rotateBy(1);
                                  this.assertSync();
                                  this.assertProperty(1, this.morph, "getRotation");
        this.morph.setExtent(pt(50, 20));
                                  this.assertSync();
                                  this.assertProperty(pt(50, 20), this.morph, "getExtent");
    },
    testMasterRotatesAndReziesSlowSync: function() {
        this.morph.rotateBy(1);
        this.morph.setExtent(pt(50, 20));
                                  this.assertSync();
                                  this.assertProperty(1, this.morph, "getRotation");
                                  this.assertProperty(pt(50, 20), this.morph, "getExtent");
    },
    testMasterReziesWhileSlaveRotates: function() {
        this.morph.setExtent(pt(50, 20));
                                                                this.morphInC().rotateBy(1);
                                  this.assertSync();
                                  this.assertProperty(pt(50, 20), this.morph, "getExtent");
                                  this.assertEquals(1, this.morphInC().getRotation());
    },
    testMasterReziesWhileSlaveDeletes: function() {
        this.morph.setExtent(pt(50, 20));
                                                                this.morphInC().remove();
                                  this.assertSync();
                                  this.assertEquals(null, this.morphInC());
        this.moveMaster(15, 60);
                                  this.assertSync();
                                  this.assertHandPosition(15, 60);
    },
    testMasterColorsSubmorphWhichWasDeletedOnClient: function() {
        var y = this.newBox(15, 20, "Y");
        this.morph.addMorph(y);
                                  this.assertSync();
        y.setRotation(1);
                                                                this.morphInC(y).remove();
                                  this.assertSync();
                                  this.assertEqualState([], this.morphInC().submorphs);
        this.moveMaster(15, 60);
                                  this.assertSync();
                                  this.assertHandPosition(15, 60);
    }
});

users.cschuster.sync.tests.SyncTest.subclass('users.cschuster.sync.tests.MultimasterTest');

}) // end of module
