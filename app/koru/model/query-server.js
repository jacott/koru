define(function(require, exports, module) {
  var util = require('../util');
  var mongodb = require('../mongo/driver');
  var koru = require('../main');

  return function (Query) {
    util.extend(Query.prototype, {
      fetch: function () {
        var results = [];
        this.forEach(function (doc) {
          results.push(doc);
        });
        return results;
      },

      fetchOne: function () {
        return this.findOne();
      },

      forEach: function (func) {
        var where = this._wheres;
        if (this.singleId) {
          var doc = this.findOne(this.singleId);
          doc && func(doc);
        } else {
          var model = this.model;
          var cursor = model.docs.find(buildQuery(this));
          this._sort && cursor.sort(this._sort);

          this._fields && cursor.fields(this._fields);
          for(var doc = cursor.next(); doc; doc = cursor.next()) {
            if (func(new model(doc)) === true)
              break;
          }
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
          docs.remove({_id: doc._id});
          model.notify(null, doc);
        });
        return count;
      },

      count: function (max) {
        if (max == null)
          return this.model.docs.count(buildQuery(this));
        else
          return this.model.docs.count(buildQuery(this), {limit: max});
      },

      addItem: function (field, value) {
        var self = this;
        var count = 0;
        var model = self.model;
        var docs = model.docs;

        self.forEach(function (doc) {
          ++count;
          var list = doc.attributes[field] || (doc.attributes[field] = []);
          var index = util.addItem(list, value);

          if (index) return 0;
          var changes = {};
          changes[field+"."+(list.length - 1)] = undefined;
          var upd = {};
          upd[field] = value;
          docs.update({_id: doc._id}, {$addToSet: upd});
          model.notify(doc, changes);
        });
        return count;
      },

      removeItem: function (field, value) {
        var self = this;
        var count = 0;
        var model = self.model;
        var docs = model.docs;

        self.forEach(function (doc) {
          ++count;
          var list = doc.attributes[field];
          if (! list || ! util.removeItem(list, value))
            return;

          var changes = {};
          changes[field+"."+list.length] = value;
          var upd = {};
          upd[field] = value;
          docs.update({_id: doc._id}, {$pull: upd});
          model.notify(doc, changes);
        });
        return count;
      },

      update: function (origChanges) {
        origChanges = origChanges || {};
        var model = this.model;
        var docs = model.docs;

        var cmd = buildUpdate(this, origChanges);

        if (util.isObjEmpty(cmd)) return 0;

        var self = this;
        var count = 0;
        self.forEach(function (doc) {
          var changes = util.deepCopy(origChanges);
          ++count;
          var attrs = doc.attributes;

          if (self._incs) for (var field in self._incs) {
            changes[field] = attrs[field] + self._incs[field];
          }

          util.applyChanges(attrs, changes);
          docs.update({_id: doc._id}, cmd);
          model.notify(doc, changes);
        });
        return count;
      },

      findOne: function(id) {
        var opts;
        if (this._fields) opts = this._fields;
        var doc = this.model.docs.findOne(buildQuery(this, id), opts);
        if (! doc) return;
        return new this.model(doc);
      },
    });
  };

  function buildQuery(query, id) {
    var result = {};
    if (id = id || query.singleId)
      result._id = id;

    if (query._wheres)
      util.extend(result, query._wheres);

    if (query._whereNots) {
      var neg = {}, wn = query._whereNots;

      for(var key in wn) {
        var value = wn[key];
        if (util.isArray(value))
          neg[key] = {$nin: value};
        else
          neg[key] = {$ne: value};
      }
      result = {$and: [result, neg]};
    }

    return result;
  }

  function buildUpdate(query, changes) {
    var cmd = {};

    if (query._incs) cmd.$inc = query._incs;

    var set, unset;
    for(var field in changes) {
      var value = changes[field];
      if (value === undefined)
        (unset = unset || {})[field] = '';
      else
        (set = set || {})[field] = value;
    }

    if (set) cmd.$set = set;
    if (unset) cmd.$unset = unset;

    return cmd;
  }
});
