define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');

  return function (session) {
    function Connection(ws, sessId, close) {
      this.ws = ws;
      this.sessId = sessId;
      this._subs = {};
      this.close = close;
      this._last = null;
      ws.on('close', close);
    }

    var binaryData = {binary: true};

    Connection.prototype = {
      constructor: Connection,

      onMessage: function (data, flags) {
        var conn = this;
        if (conn._last) {
          conn._last = conn._last[1] = [data];
          return;
        }
        var current = conn._last = [data];
        koru.Fiber(function () {
          var thread = util.thread;
          thread.userId = conn.userId;
          thread.connection = conn;

          while(current) {
            try {
              session._onMessage(conn, current[0]);
            } catch(ex) {
              koru.error(util.extractError(ex));
            }
            current = current[1];
          }
          conn._last = null;
        }).run();
      },

      send: function (type, data) {
        try {
          this.ws && this.ws.send(type + (data === undefined ? '' : data));
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      },

      sendBinary: function (type, args) {
        var msg = message.encodeMessage(type, args);
        try {
          this.ws && this.ws.send(msg, binaryData);
        } catch(ex) {
          this.closed();

          koru.error(util.extractError(ex));
        }
      },

      added: function (name, id, attrs) {
        this.sendBinary('A', [name, id, attrs]);
      },

      changed: function (name, id, attrs) {
        this.sendBinary('C', [name, id, attrs]);
      },

      removed: function (name, id) {
        this.sendBinary('R', [name, id]);
      },

      closed: function () {
        var subs = this._subs;
        this._subs = null;
        this.ws = null;
        if (subs) for(var key in subs) {
          try {subs[key].stop();}
          catch(ex) {koru.error(util.extractError(ex));}
        }
      },

      set userId(userId) {
        this._userId = userId;
        util.thread.userId = userId;
        this.send('VS', userId || '');
        var subs = this._subs;
        for(var key in subs) {
          subs[key].resubscribe();
        }
        this.send('VC');
      },

      get userId() {return this._userId},
    };

    return Connection;
  };
});
