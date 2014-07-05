define(function(require, exports, module) {
  var Model = require('../main');
  var Query = require('../query');
  var util = require('../../util');

  return function (doc, field, options) {
    if (options.changesOnly && ! (field in doc.changes)) return;
    var value = doc[field];
    if (! value) return;

    if (! (value instanceof Array))
      return this.addError(doc,field,'is_invalid');

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

    if (! modelName) {
      var scopeName = util.sansId(field);
      modelName = util.capitalize(scopeName);
    } else {
      var scopeName = util.uncapitalize(modelName);
    }

    var finder = finder ||
          doc[scopeName+'Find'] ||
          function (values) {
            return new Query(Model[modelName]).where('_id', values);
          };

    if (filter) {
      debugger;

      var query = finder.call(doc, value.slice()); // stop from being clobbered
      value.length = 0;

      query.fields('_id').forEach(function (assoc) {
        value.push(assoc._id);
      });
      value.sort();
    } else if (finder.call(doc, value).count() !== value.length) {
      this.addError(doc,field,'not_found');
    }
  };
});
