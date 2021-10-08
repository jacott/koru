define((require)=>{
  'use strict';
  const {private$}      = require('koru/symbols');
  const Trace           = require('koru/trace');
  const koru            = require('../main');
  const message         = require('./message');

  const {inspect$} = require('koru/symbols');

  const rpcType$ = Symbol();

  let debug_msg = false;
  Trace.debug_msg = value => debug_msg = !! value;

  class SessionBase {
    constructor(id) {
      this._id = id;
      this._rpcs = {};
      this._commands = {};
      this[private$] = {};
      this.DEFAULT_USER_ID = void 0;
    }

    [inspect$]() {return 'SessionBase('+this._id+')'}

    defineRpc(name, func=()=>{}) {
      this._rpcs[name] = func;
      func[rpcType$] = 'update';
      return this;
    }

    defineRpcGet(name, func=()=>{}) {
      this._rpcs[name] = func;
      func[rpcType$] = 'get';
      return this;
    }

    isRpc(name) {
      const rpc = this._rpcs[name];
      return rpc && !! rpc[rpcType$];
    }

    isRpcGet(name) {
      const rpc = this._rpcs[name];
      return rpc && rpc[rpcType$] === 'get';
    }

    provide(cmd, func) {
      const old = this._commands[cmd];
      this._commands[cmd] = func;
      return old;
    }

    unprovide(cmd) {
      this._commands[cmd] = undefined;
    }

    onStop(func) {
      (this._onStops || (this._onStops = [])).push(func);
    }

    _onMessage(conn, data) {
      let type = '', obj = null;
      if (typeof data === 'string') {
        type = data[0];
        obj = data.slice(1);
      } else {
        data = new Uint8Array(data);
        type = String.fromCharCode(data[0]);
        obj = message.decodeMessage(data.subarray(1), this.globalDict);
        debug_msg && koru.logger('D',
          `DebugMsg < ${type}: ${data.length} ${koru.util.inspect(obj).slice(0, 200)}`);
      }

      const func = this._commands[type];

      if (typeof func !== 'function')
        koru.info('Unexpected session('+this._id+') message: '+ type, conn.sessId);
      else
        func.call(conn, obj);
    }
  };

  return new SessionBase('default');
});
