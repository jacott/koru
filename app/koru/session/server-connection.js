define(function(require, exports, module) {
  var env = require('../env');

  function Connection(ws, sessId) {
    this.ws = ws;
    this.sessId = sessId;
    this._subs = {};
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
  };

  return Connection;
});
