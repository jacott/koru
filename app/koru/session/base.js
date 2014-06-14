define(function(require, exports, module) {
  var env = require('../env');

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

    _onMessage: function(conn, data) {
      if (typeof data === 'string') {
        var type = data[0];
        data = data.slice(1);
      } else {
        data = new Uint8Array(data);
        var type = String.fromCharCode(data[0]);
        data = data.subarray(1);
      }

      var func = this._commands[type];
      if (func)
        func.call(conn, data);
      else
        func || env.info('Unexpected websocket message: '+ type, conn.engine);
    },
  };
});
