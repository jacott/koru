define((require, exports, module)=>{
  'use strict';
  const Model           = require('koru/model');
  const Val             = require('koru/model/validation');

  Val.register(module, {
    associated: require('koru/model/validators/associated-validator'),
    validate: require('koru/model/validators/validate-validator'),
    inclusion: require('koru/model/validators/inclusion-validator'),
    length: require('koru/model/validators/length-validator'),
    required: require('koru/model/validators/required-validator'),
    text: require('koru/model/validators/text-validator'),
    richText: require('koru/ui/rich-text-validator'),
    unique: require('koru/model/validators/unique-validator'),
  });

  return Model;
});
