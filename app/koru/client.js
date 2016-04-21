define(function (require, exports, module) {
  'use strict';
  var koru = require('./main');
  var session = require('./session/main');
  require('./ui/helpers');
  var util = require('koru/util');

  var origLogger = koru.logger;

  koru.onunload(module, function () {
    requirejs.onError = null;
    window.removeEventListener('error', errorListener);
    koru.logger = origLogger;
  });


  window.yaajs.module.ctx.onError = logError;

  function logError(err) {
    err = koru.util.extractError(err);
    session.send('E', err);
    koru.error(err);
  }

  window.addEventListener('error', errorListener);

  function errorListener(ev) {
    if (ev.error === 'reloading') return;
    session.send('E',koru.util.extractError(ev.error));
  }

  koru.logger = function (type, ...args) {
    console.log.apply(console, args);
    if (type === 'ERROR')
      session.send('E', args.join(' '));
    else
      session.send("L", type+ ": " + (type === '\x44EBUG' ? util.inspect(args, 7) : args.join(' ')));
  };

  return koru;
});
