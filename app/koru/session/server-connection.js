define(function(require, exports, module) {
  var env = require('../env');

  function Connection(ws, sessId, close) {
    this.ws = ws;
    this.sessId = sessId;
    this._subs = {};
    this.close = close;
    ws.on('close', close);
  }

  Connection.prototype = {
    constructor: Connection,

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
      var subs = this._subs;
      for(var key in subs) {
        subs[key].resubscribe();
      }
      this.ws.send('VS'+userId);
    },

    get userId() {return this._userId},
  };

  return Connection;
});
