define(function(require, exports, module) {

  module.exports = mig => {
    mig.createTable({
      name: '$$modelName$$',
      fields: {
        $$modelFields$$
      }
    });
  };
});
