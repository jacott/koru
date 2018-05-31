define((require, exports, module)=>{

  module.exports = mig =>{
    mig.createTable({
      name: $$tableName$$,
      fields: [
        $$addColumns$$
      ]
    });
  };
});
