define({
  method: function (doc, field, options) {
    if (options.changesOnly && ! (field in doc.changes)) return;
    var value = doc[field];
    if (! value) return;

    if (! (value instanceof Array))
      return AppVal.addError(doc,field,'is_invalid');

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
      var scopeName = Apputil.sansId(field);
      modelName = Apputil.capitalize(scopeName);
    } else {
      var scopeName = Apputil.uncapitalize(modelName);
    }

    var finder = options.finder || doc[scopeName+'Find'] || AppModel[modelName].find;

    if (filter) {
      var query = {_id: {$in: value.slice(0)}};
      value.length = 0;

      var results = finder.call(doc, query, {fields: {_id: 1}});
      results && results.forEach(function (assoc) {
        value.push(assoc._id);
      });
      value.sort();
    } else if (finder.call(doc,{_id: {$in: value}}).count() !== value.length) {
      AppVal.addError(doc,field,'not_found');
    }
  },
});
