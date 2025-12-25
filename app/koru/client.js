define((require, exports, module) => {
  'use strict';
  const {inspect}       = require('koru/util');
  const util            = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session/main');

  let lastLog = 0, logCount = 0;

  const isRatelimit = ! isTest && koru.config.env !== 'demo';

  koru.clientLogger = koru.logger = (type, ...args) => {
    if (isRatelimit && type !== 'D' && koru.config.env && ++logCount > 5) {
      if (lastLog + 60000 > Date.now()) return;
      logCount = 0;
    }
    lastLog = Date.now();
    if (type === 'E') {
      console.error(...args);
      session.send('E', args.join(' '));
    } else {
      console.log(...args);
      session.send('L', type + '> ' + (
        type === 'D'
          ? util.inspect(args, 7)
          : args.join(' ')));
    }
  };

  koru.unregisterServiceWorker = () => {
    const {serviceWorker} = navigator;
    if (serviceWorker != null && serviceWorker.controller != null) {
      serviceWorker.register(serviceWorker.controller.scriptURL).then((reg) => {
        reg.unregister().then(koru.reload);
      });
      return true;
    }
    return false;
  };

  koru.onunload(module, 'reload');

  return koru;
});
