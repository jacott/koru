define(function(require, exports, module) {
  return function (mig) {
    mig.reversible({
      add: function (client) {
        client.query('ALTER TABLE "TestTable" ADD COLUMN bar date');
      },
      revert: function (client) {
        client.query('ALTER TABLE "TestTable" DROP COLUMN bar');
      }
    });
  };
});
