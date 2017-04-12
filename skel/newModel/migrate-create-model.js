define(function(require, exports, module) {

  module.exports = function (mig) {
    mig.createTable({
      name: '$$modelName$$',
      fields: {
        $$modelFields$$
      }
    });
  };
});
