define(()=> mig =>{
  mig.reversible({
    add(client) {
      client.query('ALTER TABLE "TestTable" RENAME COLUMN bar TO bazt');
    },
    revert(client) {
      client.query('ALTER TABLE "TestTable" RENAME COLUMN bazt TO bar');
    }
  });
  mig.reversible({
    add(client) {
      client.query('ALTER TABLE "TestTable" RENAME COLUMN bazt TO baz');
    },
    revert(client) {
      client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO bazt');
    }
  });
});
