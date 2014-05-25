define(['module', './env', './util', './errors'], function (module, env, util, errors) {
  env.onunload(module, 'reload');

  /**
   * The session aware base of Koru.
   * @export koru/core
   */
  return (isServer ? global : window)._koru_ = {
    Error: errors.Error.bind(errors),
    Fiber: util.Fiber,
    onunload: env.onunload,
    util: util,

    "\x64ebug": function () {
      this.logger('\x44EBUG', Array.prototype.slice.call(arguments, 0));
    },

    info: function () {
      this.logger('INFO', Array.prototype.join.call(arguments, ' '));
    },

    error: function () {
      this.logger('ERROR', Array.prototype.join.call(arguments, ' '));
    },

    logger: function () {
      console.log.apply(console, arguments);
    },
  };
});
