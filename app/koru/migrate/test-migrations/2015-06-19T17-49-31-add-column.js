define(function(require, exports, module) {
  return function (mig) {
    mig.reversible({
      add(client) {
        client.query('ALTER TABLE "TestTable" ADD COLUMN bar date');
      },
      revert(client) {
        client.query('ALTER TABLE "TestTable" DROP COLUMN bar');
      }
    });
  };
});
