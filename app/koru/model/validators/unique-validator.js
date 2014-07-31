define(function () {
  return function (doc,field, options) {
    options = options || {};

    var val = doc[field];
    var query = doc.constructor.query;
    query.where(field, val);

    var scope = options.scope;
    if (scope) {
      if (! Array.isArray(scope)) scope = [scope];
      scope = scope.forEach(function (f) {
        query.where(f, doc[f]);
      });
    }

    if (! doc.$isNewRecord()) query.whereNot('_id', doc._id);

    if (query.count(1) !== 0)
      this.addError(doc,field,'not_unique');
  };
});
