define(function(require, exports, module) {
  return function (mig) {
    mig.reversible({
      add: function (client) {
        client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO fnord');
        client.query('SELECT baz FROM "TestTable"');
      },
      revert: function (client) {
        throw new Error("I should not be called");
      }
    });
  };
});
