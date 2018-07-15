define((require)=> mig =>{
  mig.createTable({
    name: $$tableName$$,
    fields: [
      $$addColumns$$
    ]
  });
});
