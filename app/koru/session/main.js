define(function(require) {
  var env = require('../env');
  var session = require('./base');

  session._onMessage = function(conn, data) {
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
  };

  require('../env!./main')(session);

  return session;
});
