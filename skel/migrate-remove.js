define(function(require, exports, module) {

  module.exports = mig =>{
    mig.reversible({
      add() {
        mig.removeColumns($$tableName$$, $$removeColumns$$);
      },

      remove() {
        mig.addColumns($$tableName$$, $$addColumns$$);
      },
    });
  };
});
