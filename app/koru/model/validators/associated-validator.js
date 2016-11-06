define(function(require, exports, module) {
  const util  = require('koru/util');
  const Model = require('../main');
  const Query = require('../query');

  return function (doc, field, options) {
    if (options.changesOnly && ! (field in doc.changes)) return;
    let value = doc[field];
    if (! value) return;

    const fieldOpts = doc.constructor.$fields && doc.constructor.$fields[field];
    const belongs_to = fieldOpts && fieldOpts.type === 'belongs_to';

    if (belongs_to ? typeof value !== 'string' : ! Array.isArray(value))
      return this.addError(doc,field,'is_invalid');

    if (belongs_to)
      value = [value];

    switch (typeof options) {
    case 'object':
      var modelName = options.modelName;
      var finder = options.finder;
      var filter = options.filter;
      break;
    case 'string':
      var modelName = options;
      break;
    }
    if (belongs_to && ! modelName) {
      modelName = fieldOpts.model && fieldOpts.model.modelName;
    }

    if (! modelName) {
      var scopeName = util.sansId(field);
      modelName = util.capitalize(scopeName);
    } else {
      var scopeName = util.uncapitalize(modelName);
    }

    finder = finder ||
      doc[scopeName+'Find'] ||
      (values => new Query(Model[modelName]).where('_id', values));

    if (filter) {
      var query = finder.call(doc, value.slice()); // stop from being clobbered
      value.length = 0;

      query.fields('_id').forEach(assoc => value.push(assoc._id));
      value.sort();
      if (belongs_to) doc[field] = value[0];
    } else if (finder.call(doc, value).count() !== value.length) {
      this.addError(doc,field,'not_found');
    }
  };
});
