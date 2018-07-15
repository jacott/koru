define(()=> mig =>{
  mig.reversible({
    add(client) {
      client.query('ALTER TABLE "TestTable" RENAME COLUMN baz TO fnord');
      client.query('SELECT baz FROM "TestTable"');
    },
    revert(client) {
      throw new Error("I should not be called");
    }
  });
});
