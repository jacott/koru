define((require, exports, module)=>{
  'use strict';
  const Intercept       = require('koru/test/intercept');

  return ()=>{
    Intercept.finishIntercept();
  };
});
