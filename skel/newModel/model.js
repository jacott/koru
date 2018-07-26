define((require, exports, module)=>{
  const Model           = require('models/model');

  class $$modelName$$ extends Model.BaseModel {
  }

  $$modelName$$.define({module, fields: {
    $$modelFields$$,
  }});

  return $$modelName$$;
});
