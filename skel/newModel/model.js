define((require, exports, module)=>{
  const Model           = require('models/model');

  const fields = {
    $$modelFields$$,
  };

  class $$modelName$$ extends Model.BaseModel {
  }

  $$modelName$$.define({module, fields});

  return $$modelName$$;
});
