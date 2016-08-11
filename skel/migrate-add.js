define(function(require, exports, module) {

  module.exports = function (mig) {
    mig.reversible({
      add() {
        mig.addColumns($$tableName$$, $$addColumns$$);
      },

      remove() {
        mig.removeColumns($$tableName$$, $$removeColumns$$);
      },
    });
  };
});
