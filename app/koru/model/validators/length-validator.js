define({
  maxLength(doc, field, length) {
    const val = doc[field];
    if (val != null && typeof val.length === 'number' && doc[field].length > length) {
      this.addError(doc, field, 'too_long', length);
    }
  },
});
