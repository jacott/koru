define(() => (mig) => {
  mig.reversible({
    async add(client) {
      await client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO fnord');
      await client.query('SELECT baz FROM "TestTable"');
    },
    revert(client) {
      throw new Error('I should not be called');
    },
  });
});
