Lively Sync
-----------

Using the built-in serialization of [LivelyKernel][1] to implement diffing and
patching of serialized state. This logging of Lively worlds over time can be
used to...

  * Syncronize two or more Lively worlds
  * Keeping a history of changes to a Lively world over time
    (e.g. for doing a screencast)
  * Simple undo/redo support

Syncronization is done by communicating with [Socket.IO][2] to the SyncServer
running with [Node.js][3] and storing changes in [PostgreSQL][4].

The documentation of this approach is shown on [http://lively-kernel.org/][5].

Installation is done by cloning the repository into the lively root folder
(next to ``/core/``) and adding the following two lines to ``/core/lively/localconfig.js``:

    lively.Config.add("modulePaths", "sync");
    lively.Config.addOptions("sync", [
        ["syncServer", "http://localhost:8114", "The URL of the sync server endpoint"]
    ]);
    lively.Config.set("syncServer", "http://myserver:8114");


[1]: http://github.com/LivelyKernel/LivelyKernel
[2]: http://socket.io/
[3]: http://nodejs.org/
[4]: http://www.postgresql.org/
[5]: http://lively-kernel.org/repository/webwerkstatt/documentation/Sync.xhtml
