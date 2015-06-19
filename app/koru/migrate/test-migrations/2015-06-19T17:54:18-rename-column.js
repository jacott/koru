define(function(require, exports, module) {
  return function (mig) {
    mig.reversible({
      add: function (client) {
        client.query('ALTER TABLE "TestTable" RENAME COLUMN bar TO baz');
      },
      revert: function (client) {
        client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO bar');
      }
    });
  };
});
