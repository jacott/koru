define({
  required(doc, field, reqType) {
    let value = doc[field];

    if (typeof reqType === 'function') {
      if (reqType.call(doc, value, field)) return;
      value = null;
    } else {
      switch (reqType) {
        case 'not_null': break;
        case false: return;
        case 1:
          if (! value || ! value.length) value = null;
          break;
        default:
          if (! value) value = null;
      }
    }

    if (value == null) {
      this.addError(doc, field, 'is_required');
    }
  },
});
