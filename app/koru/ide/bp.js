define((require, exports, module)=>{
  'use strict';
  const Intercept       = require('koru/test/intercept');

  return (ws, clients, data)=>{
    const [a1, a2, interceptPrefix] = data.split('\t', 3);
    const id = a1.replace(/^app\//, '');
    const epos = +a2 - 1;
    const source = data.slice(a1.length + a2.length + interceptPrefix.length + 3);
    Intercept.ws = ws;
    Intercept.interceptObj = void 0;
    Intercept.breakPoint(id, epos, interceptPrefix, source);
  };
});
