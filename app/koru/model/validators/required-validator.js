define(function () {
  return function (doc, field, reqType) {
    var value = doc[field];

    switch (reqType) {
    case 'not_null': break;
    case false: return;
    case 1:
      if (! value || ! value.length) value = null;
    default:
      if (! value) value = null;
    }

    if (value == null)
      this.addError(doc,field,'is_required');
  };
});
