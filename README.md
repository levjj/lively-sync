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

[1]: http://github.com/LivelyKernel/LivelyKernel
[2]: http://socket.io/
[3]: http://nodejs.org/
[4]: http://www.postgresql.org/
[5]: http://lively-kernel.org/repository/webwerkstatt/documentation/Sync.xhtml
