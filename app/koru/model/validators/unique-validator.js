define((require)=>{
  'use strict';
  const util  = require('koru/util');

  const insertData = (doc, scope)=>{
    for (let arg in scope) {
      const value = scope[arg];
      if (typeof value === 'string')
        scope[arg] = doc[value];
      else
        insertData(doc, value);
    }
  };

  return function (doc,field, options={}) {
    const val = doc[field];
    const query = doc.constructor.query;
    query.where(field, val);

    const {scope} = options;
    if (scope) {
      switch (typeof scope) {
      case 'string': query.where(scope, doc[scope]); break;
      case 'function': scope(query, doc, field, options); break;
      case 'object':
        if (Array.isArray(scope))
          scope.forEach(f => query.where(f, doc[f]));
        else {
          const copy = util.deepCopy(scope);
          insertData(doc, copy);
          Object.assign(query._wheres, copy);
        }
        break;
      }
    }

    if (! doc.$isNewRecord()) query.whereNot('_id', doc._id);

    if (query.count(1) !== 0)
      this.addError(doc,field,'not_unique');
  };
});
