define((require, exports, module)=>{
  'use strict';

  const Test            = require('koru/test');

  return Intercept => {
    const {ctx} = module;

    class ClientIntercept extends Intercept {
      static sendCandidates(cand) {
        Test.testHandle('I', cand);
        this.finishIntercept();
      }
    }

    return ClientIntercept;
  };
});
