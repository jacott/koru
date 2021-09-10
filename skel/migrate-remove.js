define(() => (mig) => {
  mig.reversible({
    add() {
      mig.removeColumns($$tableName$$, $$removeColumns$$);
    },

    remove() {
      mig.addColumns($$tableName$$, $$addColumns$$);
    },
  });
});
