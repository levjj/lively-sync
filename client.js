/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared').toRun(function() {

users.cschuster.sync.diff.Snapshot.addMethods({
     getSerializer: function(data) {
        var serializer = ObjectGraphLinearizer.forNewLivelyCopy();
        serializer.addPlugins(lively.persistence.getPluginsForLively());
        var p = new GenericFilter();
        p.addFilter(function(obj, prop, value) {
            return obj.isScript && prop == "currentTimeout";
        });
        serializer.addPlugins([p]);
        serializer.showLog = false;
        return serializer;
    },
    createFromMorphs: function(morphs) {

    }
});

users.cschuster.sync.diff.Patch.addMethods({
    applyToMorphs: function(morphs) {
    
    }
});


cop.create("HierachicalIds").refineClass(lively.persistence.ObjectGraphLinearizer, {
    newId: function() {
        var id = this.path.join('/');
        while (this.registry[id]) id = "#" + id;
        return id;
    }
}).beGlobal();

});