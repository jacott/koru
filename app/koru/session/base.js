define({
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
});
