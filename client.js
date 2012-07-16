/**
 * Client part of syncing
 * (morphic integration, etc.)
 */

module('users.cschuster.sync.client').requires('users.cschuster.sync.shared').toRun(function() {
    users.cschuster.sync.diff.Snapshot.addMethods({
        createFromMorphs: function(morphs) {
        
        }
    });

    users.cschuster.sync.diff.Patch.addMethods({
        applyToMorphs: function(morphs) {
        
        }
    });
});
