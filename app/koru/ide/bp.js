define((require, exports, module) => {
  'use strict';
  const Intercept       = require('koru/test/intercept');

  return (ws, clients, data) => {
    data[0] = data[0].replace(/^app\//, '');
    Intercept.ws = ws;
    Intercept.breakPoint(...data);
  };
});
