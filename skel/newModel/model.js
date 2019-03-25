define((require, exports, module)=>{
  'use strict';
  const Model           = require('models/model');

  class $$modelName$$ extends Model.BaseModel {
  }

  $$modelName$$.define({module, fields: {
    $$modelFields$$,
  }});

  return $$modelName$$;
});
