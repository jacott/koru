define(() => (mig) => {
  mig.reversible({
    async add(client) {
      await client.query('ALTER TABLE "TestTable" ADD COLUMN bar date');
    },
    async revert(client) {
      await client.query('ALTER TABLE "TestTable" DROP COLUMN bar');
    },
  });
});
