define(function(require, exports, module) {
  return function (mig) {
    mig.createTable('TestTable', {
      name: {type: 'text'}
    });
  };
});
