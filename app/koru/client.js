define(function (require, exports, module) {
  var koru = require('./main');
  var session = require('./session/main');
  require('./ui/helpers');
  var util = require('koru/util');

  var origLogger = koru.logger;

  koru.onunload(module, function () {
    requirejs.onError = null;
    koru.logger = origLogger;
  });


  window.yaajs.module.ctx.onError = function (err) {
    err = koru.util.extractError(err);
    session.send('E', err);
    koru.error(err);
  };

  koru.logger = function (type) {
    console.log.apply(console, arguments);
    var args = new Array(arguments.length - 1);
    for(var i = 0; i < args.length; ++i) args[i] = arguments[i+1];
    if (type === 'ERROR')
      session.send('E', args.join(' '));
    else
      session.send("L", type+ ": " + (type === '\x44EBUG' ? util.inspect(args, 7) : args.join(' ')));
  };

  return koru;
});
