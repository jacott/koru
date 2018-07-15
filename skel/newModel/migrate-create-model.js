define(()=> mig =>{
  mig.createTable({
    name: '$$modelName$$',
    fields: {
      $$modelFields$$
    }
  });
});
