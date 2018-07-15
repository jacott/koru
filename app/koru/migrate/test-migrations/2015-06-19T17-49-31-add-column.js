define(()=> mig =>{
  mig.reversible({
    add(client) {
      client.query('ALTER TABLE "TestTable" ADD COLUMN bar date');
    },
    revert(client) {
      client.query('ALTER TABLE "TestTable" DROP COLUMN bar');
    }
  });
});
