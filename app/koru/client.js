define((require, exports, module)=>{
  'use strict';
  const util            = require('koru/util');
  const {extractError, inspect} = require('koru/util');
  const koru            = require('./main');
  const session         = require('./session/main');

  const errorListener = ev =>{
    if (ev.filename) {
      koru.logger('ERROR', extractError({
        toString() {
          return ev.error;
        },
        stack: "\tat "+ ev.filename + ':' + ev.lineno + ':' + ev.colno,
      }));
      if (ev.error.name === 'SyntaxError')
        return;
    }
    if (ev.error)
      koru.logger('ERROR', extractError(ev.error));
  };

  koru.logger = (type, ...args)=>{
    console.log(...args);
    if (type === 'ERROR')
      session.send('E', args.join(' '));
    else
      session.send("L", type+ ": " +
                   (type === '\x44EBUG' ? inspect(args, 7) : args.join(' ')));
  };

  window.addEventListener('error', errorListener);

  koru.onunload(module, 'reload');

  return koru;
});
