define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Test            = require('koru/test');
  const Core            = require('koru/test/core');

  return Intercept => {
    const {ctx} = module;

    let intercepting = false;

    let providing = false;

    class ClientIntercept extends Intercept {
      static sendResult(cand) {
        if (! providing) {
          providing = true;
          Test.session.provide('D', data => {
            Test.testHandle('ID' + JSON.stringify(ClientIntercept.objectSource(data)));
          });
        }
        intercepting = cand[0] === 'C';
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
