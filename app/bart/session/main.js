define(function(require) {
  var core = require('../core');

  var session = {
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
      var type = data.slice(0,1);
      data = data.slice(1);
      var func = this._commands[type];
      if (func)
        func.call(conn, data);
      else
        func || core.info('Unexpected websocket message: '+ type, conn.engine);
    },
  };

  return session;

});
