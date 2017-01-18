define(function (require, exports, module) {
  'use strict';
  const util    = require('koru/util');
  const koru    = require('./main');
  const session = require('./session/main');

  koru.onunload(module, 'reload');

  window.yaajs.module.ctx.onError = logError;

  function logError(err) {
    err = koru.util.extractError(err);
    session.send('E', err);
    koru.error(err);
  }

  window.addEventListener('error', errorListener);

  function errorListener(ev) {
    koru.error('E',koru.util.extractError(ev.error));
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
