define(function(require) {
  var env = require('../env');

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
        func || env.info('Unexpected websocket message: '+ type, conn.engine);
    },
  };

  require('../env!./main')(session);

  return session;

});
