define((require, exports, module) => {
  'use strict';
  const Model           = require('koru/model');
  const Val             = require('koru/model/validation');
  const AssociatedValidator = require('koru/model/validators/associated-validator');
  const InclusionValidator = require('koru/model/validators/inclusion-validator');
  const LengthValidator = require('koru/model/validators/length-validator');
  const RequiredValidator = require('koru/model/validators/required-validator');
  const TextValidator   = require('koru/model/validators/text-validator');
  const UniqueValidator = require('koru/model/validators/unique-validator');
  const ValidateValidator = require('koru/model/validators/validate-validator');
  const RichTextValidator = require('koru/ui/rich-text-validator');

  Val.register(module, {
    AssociatedValidator,
    InclusionValidator,
    LengthValidator,
    RequiredValidator,
    RichTextValidator,
    TextValidator,
    UniqueValidator,
    ValidateValidator,
  });

  return Model;
});
