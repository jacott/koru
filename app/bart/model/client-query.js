define(function(require, exports, module) {
  var util = require('../util');

  return {
    init: function (Query) {
      util.extend(Query.prototype, {
        fetch: function () {
          var results = [];
          this.forEach(function (doc) {
            results.push(doc);
          });
          return results;
        },

        forEach: function (func) {
          var where = this._conditions;
          if (this.singleId) {
            var doc = this.findOne(this.singleId);
            doc && func(doc);
          } else for(var id in this.model.docs) {
            var doc = this.findOne(id);
            doc && func(doc);
          }
        },

        map: function (func) {
          var results = [];
          this.forEach(function (doc) {
            results.push(func(doc));
          });
          return results;
        },

        remove: function () {
          var count = 0;
          var model = this.model;
          var docs = model.docs;
          this.forEach(function (doc) {
            ++count;
            delete docs[doc._id];
            model.notify(doc, 'remove');
          });
          return count;
        },

        count: function () {
          var count = 0;
          var docs = this.model.docs;
          this.forEach(function (doc) {
            ++count;
          });
          return count;
        },

        update: function (changes) {
          var self = this;
          var count = 0;
          var model = self.model;
          var docs = model.docs;
          self.forEach(function (doc) {
            ++count;
            var attrs = doc.attributes;

            if (self._incs) for (var field in self._incs) {
              attrs[field] += self._incs[field];
            }

            util.swapWithDelete(attrs, changes);
            model.notify(doc, changes);
          });
          return count;
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
