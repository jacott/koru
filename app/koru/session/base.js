define(function(require, exports, module) {
  var koru = require('../main');
  var message = require('./message');

  function Constructor() {
    return {
      defineRpc: function (name, func) {
        this._rpcs[name] = func;
        return this;
      },
      _rpcs: {},
      _commands: {},

      provide: function (cmd, func) {
        var old = this._commands[cmd];
        this._commands[cmd] = func;
        return old;
      },

      unprovide: function (cmd) {
        delete this._commands[cmd];
      },

      _onMessage: function(conn, data) {
        if (typeof data === 'string') {
          var type = data[0];
          data = data.slice(1);
        } else {
          data = new Uint8Array(data);
          var type = String.fromCharCode(data[0]);
          data = message.decodeMessage(data.subarray(1), this.globalDict);
        }

        var func = this._commands[type];
        if (func)
          func.call(conn, data);
        else
          koru.info('Unexpected websocket message: '+ type, conn.sessId);
      },
    };
  }

  exports = Constructor();
  exports.__initBase__ = Constructor;
  return exports;
});
