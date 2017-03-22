define(function(require, exports, module) {
  var koru = require('../main');
  var message = require('./message');

  const rpcType = Symbol();

  class SessionBase {
    constructor(id) {
      this._id = id;
      this._rpcs = {};
      this._commands = {};
    }

    defineRpc(name, func) {
      this._rpcs[name] = func;
      func[rpcType] = 'update';
      return this;
    }

    defineRpcGet(name, func) {
      this._rpcs[name] = func;
      func[rpcType] = 'get';
      return this;
    }

    isRpc(name) {
      const rpc = this._rpcs[name];
      return rpc && !! rpc[rpcType];
    }

    isRpcGet(name) {
      const rpc = this._rpcs[name];
      return rpc && rpc[rpcType] === 'get';
    }

    provide(cmd, func) {
      var old = this._commands[cmd];
      this._commands[cmd] = func;
      return old;
    }

    unprovide(cmd) {
      this._commands[cmd] = null;
    }

    onStop(func) {
      (this._onStops || (this._onStops = [])).push(func);
    }

    _onMessage(conn, data) {
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
        koru.info('Unexpected session message: '+ type, conn.sessId);
    }
  };

  exports = new SessionBase('default');
  return exports;
});
