define({
  validate(doc, field, validator) {
    validator.call(doc, field);
  },
});
