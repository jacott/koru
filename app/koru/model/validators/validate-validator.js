define({
  validate(doc, field, validator) {
    doc.$hasChanged(field) && validator.call(doc, field);
  },
});
