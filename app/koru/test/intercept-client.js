define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Test            = require('koru/test');
  const Core            = require('koru/test/core');

  return Intercept => {
    const {ctx} = module;

    let intercepting = false;

    class ClientIntercept extends Intercept {
      static sendCandidates(cand) {
        intercepting = true;
        Test.testHandle('I', cand);
        this.finishIntercept();
      }
    }

    if (isTest) {
      Core.onEnd(() => {
        if (intercepting) {
          intercepting = false;
        }
      });

      Core.onAbort(() => {
        if (intercepting) koru.reload();
      });
    }

    return ClientIntercept;
  };
});
