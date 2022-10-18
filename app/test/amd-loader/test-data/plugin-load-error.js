define((require, exports, module)=>{
  const dep2 = require('./dep2');
  const envFoo = require('./env!syntax-error');
});
