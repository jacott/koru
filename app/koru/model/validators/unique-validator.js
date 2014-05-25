define(function () {
  return function (doc,field, options) {
    options = options || {};

    var val = doc[field];
    var query = {};
    query[field] = val;
    var sq = {};

    var scope = options.scope;
    if (scope) {
      if (! (scope instanceof Array)) scope = [scope];
      scope = scope.forEach(function (f) {
        sq[f] = doc[f];
      });

    }

    if (! doc.$isNewRecord()) sq._id= {$ne: doc._id};

    val = null;
    for(val in sq) {break;}
    if (val) {
      query = {$and: [sq, query]};
    }

    if (doc.constructor.exists(query))
      this.addError(doc,field,'not_unique');
  };
});
