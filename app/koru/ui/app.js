define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Val             = require('koru/model/validation');
  const Flash           = require('koru/ui/flash');
  const util            = require('koru/util');

  return {
    flashUncaughtErrors: ()=>{
      const {unexpectedError, globalErrorCatch, globalCallback} = koru;

      koru.unexpectedError = (userMsg, logMsg) => {
        Flash.error('unexpected_error:'+(userMsg||logMsg));
        koru.error('Unexpected error', (logMsg||userMsg));
      };

      koru.globalErrorCatch = koru.globalCallback = e =>{
        if (! e) return;
        let reason = e.reason || e.toString();
        if (typeof reason === 'object') {
          try {
            reason = Val.Error.toString(reason);
          } catch(ex) {
            reason = util.inspect(reason);
          }
          reason = `Update failed: ${reason}`;
        }
        if (typeof e.error !== "number" || e.error >= 500) {
          (e instanceof Error) && koru.unhandledException(e);
          Flash.error(reason);
        } else {
          isTest && (e instanceof Error) && koru.error(util.extractError(e));
          Flash.notice(reason);
        }
        return true;
      };

      return ()=>{
        koru.unexpectedError = unexpectedError;
        koru.globalErrorCatch = globalErrorCatch;
        koru.globalCallback = globalCallback;
      };
    },
  };
});
