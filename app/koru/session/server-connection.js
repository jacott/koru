define(function(require, exports, module) {
  var env = require('../env');
  var util = require('../util');

  return function (session) {
    function Connection(ws, sessId, close) {
      this.ws = ws;
      this.sessId = sessId;
      this._subs = {};
      this.close = close;
      this._last = null;
      ws.on('close', close);
    }

    Connection.prototype = {
      constructor: Connection,

      onMessage: function (data, flags) {
        var conn = this;
        if (conn._last) {
          conn._last = conn._last[1] = [data];
          return;
        }
        var current = conn._last = [data];
        env.Fiber(function () {
          var thread = util.thread;
          thread.userId = conn.userId;
          thread.connection = conn;

          while(current) {
            try {
              session._onMessage(conn, current[0]);
            } catch(ex) {
              env.error(util.extractError(ex));
            }
            current = current[1];
          }
          conn._last = null;
        }).run();
      },

      added: function (name, id, attrs) {
        this.ws.send('A'+name+'|'+id+JSON.stringify(attrs), env.nullFunc);
      },

      changed: function (name, id, attrs) {
        this.ws.send('C'+name+'|'+id+JSON.stringify(attrs), env.nullFunc);
      },

      removed: function (name, id) {
        this.ws.send('R'+name+'|'+id, env.nullFunc);
      },

      closed: function () {
        var subs = this._subs;
        if (subs) for(var key in subs) {
          subs[key].stop();
        }
        this._subs = null;
      },

      set userId(userId) {
        this._userId = userId;
        util.thread.userId = userId;
        this.ws.send('VS'+userId);
        var subs = this._subs;
        for(var key in subs) {
          subs[key].resubscribe();
        }
        this.ws.send('VC');
      },

      get userId() {return this._userId},
    };

    return Connection;
  };
});
