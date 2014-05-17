define(function(require, exports, module) {
  var util = require('../util');

  return {
    init: function (Query) {
      util.extend(Query.prototype, {
        fetch: function () {
          var results = [];
          var where = this._conditions;
          if (this.singleId) {
            var doc = this.findOne(this.singleId);
            doc && results.push(doc);
          } else for(var id in this.model.docs) {
            var doc = this.findOne(id);
            doc && results.push(doc);
          }

          return results;
        },

        update: function (changes) {
          var docs = this.model.docs;
          var doc = this.findOne(this.singleId);
          if (! doc) return 0;
          var attrs = doc.attributes;

          if (this._incs) for (var field in this._incs) {
            attrs[field] += this._incs[field];
          }

          util.extendWithDelete(attrs, changes);
          return 1;
        },

        findOne: function(id) {
          var doc = this.model.docs[id];
          if (! doc) return;
          var attrs = doc.attributes;
          var where = this._conditions;
          if (where) for(var field in where) {
            if (attrs[field] != where[field])
              return;
          }
          return doc;
        },
      });
    },
  };
});
