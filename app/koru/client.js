define((require, exports, module)=>{
  'use strict';
  const util            = require('koru/util');
  const {extractError, inspect} = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session/main');

  const errorListener = ev =>{
    if (ev.filename) {
      if (ev.error.name === 'SyntaxError') {
        koru.logger('E', ev.error +
                    "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno);
        return;
      }
    }
    if (ev.error)
      koru.logger('E', extractError(ev.error));
  };

  koru.logger = (type, ...args)=>{
    if (type === 'E') {
      console.error(...args);
      session.send('E', args.join(' '));
    } else {
      console.log(...args);
      session.send("L", type+ "> " + (
        type === 'D' ? util.inspect(args, 7) :
          args.join(' ')));
    }
  };

  koru.unregisterServiceWorker = ()=>{
    const {serviceWorker} = navigator;
    if (serviceWorker != null && serviceWorker.controller != null) {
      serviceWorker.register(serviceWorker.controller.scriptURL).then(reg => {
        reg.unregister().then(koru.reload);
      });
      return true;
    }
    return false;
  };

  window.addEventListener('error', errorListener);

  koru.onunload(module, 'reload');

  return koru;
});
