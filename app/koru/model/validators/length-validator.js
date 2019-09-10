define({
  maxLength(doc, field, length) {
    if (! doc.$hasChanged(field)) return;

    if (doc[field].length > length) {
      this.addError(doc, field, 'too_long', length);
    }
  },
});
