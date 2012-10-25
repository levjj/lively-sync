module('sync.undo').requires('sync.client').toRun(function() {

Object.subclass('sync.undo.Do',
'initializing', {
    initialize: function(morphs, fn) {
        this.wc = new sync.WorkingCopy();
        this.wc.addPlugin(new sync.MorphPlugin(lively.morphic.World.current()));
        for (var i = 0; i < morphs.length; i++) {
            this.wc.addObject(morphs[i]);
        }
        this.wc.last = sync.Snapshot.createFromObjects(this.wc.syncTable)
        this.wc.old = this.wc.last.clone();
        fn();
        this.wc.commit();
        this.patch = this.wc.patchQueue[1];
    },
},
'accessing', {
    getUndo: function() {
        if (!this.undoPatch) {
            this.undoPatch = this.wc.last.diff(this.wc.old).toPatch();
        }
        return this.undoPatch.clone();
    }
},
'undoing', {
    undo: function() {
        this.wc.loadPatch(this.getUndo());
    },
    redo: function() {
        this.wc.loadPatch(this.patch.clone());
    }
},
'debugging', {
    inspect: function() {
        var part = lively.morphic.World.current().openPartItem('DiffViewer', 'PartsBin/Sync');
        part.show(this.getPatch());
    }
});

Object.extend(Global, {
    record: function(morph, fun) {
        return new sync.undo.Do(morph, fun);
    }
});

}) // end of module
