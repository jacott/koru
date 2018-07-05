define(()=>{
  return function (doc, field, reqType) {
    let value = doc[field];

    switch (reqType) {
    case 'not_null': break;
    case false: return;
    case 1:
      if (! value || ! value.length) value = null;
      break;
    default:
      if (! value) value = null;
    }

    if (value == null)
      this.addError(doc,field,'is_required');
  };
});
