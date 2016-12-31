define(function(require, exports, module) {
  const util  = require('koru/util');

  return function (doc,field, options) {
    options = options || {};

    const val = doc[field];
    const query = doc.constructor.query;
    query.where(field, val);

    var scope = options.scope;
    if (scope) {
      if (typeof scope === 'string') scope = [scope];
      if (Array.isArray(scope))
        scope.forEach(f => query.where(f, doc[f]));
      else {
        const copy = util.deepCopy(scope);
        insertData(doc, copy);
        util.merge(query._wheres, copy);
      }
    }

    if (! doc.$isNewRecord()) query.whereNot('_id', doc._id);

    if (query.count(1) !== 0)
      this.addError(doc,field,'not_unique');
  };

  function insertData(doc, scope) {
    for (let arg in scope) {
      const value = scope[arg];
      if (typeof value === 'string')
        scope[arg] = doc[value];
      else
        insertData(doc, value);
    }
  }
});
