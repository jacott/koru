define(() => (mig) => {
  mig.reversible({
    async add(client) {
      await client.query('ALTER TABLE "TestTable" RENAME COLUMN bar TO bazt');
    },
    async revert(client) {
      await client.query('ALTER TABLE "TestTable" RENAME COLUMN bazt TO bar');
    },
  });
  mig.reversible({
    async add(client) {
      await client.query('ALTER TABLE "TestTable" RENAME COLUMN bazt TO baz');
    },
    async revert(client) {
      await client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO bazt');
    },
  });
});
