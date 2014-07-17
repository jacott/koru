define(function(require, exports, module) {
  var util = require('../util');
  var mongodb = require('../mongo/driver');
  var koru = require('../main');

  return function (Query) {
    util.extend(Query.prototype, {
      withIndex: function (idx, params) {
        return this.where(params);
      },

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

      fetchIds: function () {
        if (this.singleId) throw Error('fetchIds onId not supported');

        var model = this.model;
        var cursor = model.docs.find(buildQuery(this), {_id: 1});
        this._sort && cursor.sort(this._sort);

        var results = [];
        for(var doc = cursor.next(); doc; doc = cursor.next()) {
          results.push(doc._id);
        }
        return results;
      },

      show: function (func) {
        func(JSON.stringify(buildQuery(this)));
        return this;
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

      update: function (origChanges, value) {
        if (typeof origChanges === 'string') {
          var changes = {};
          changes[origChanges] = value;
          origChanges = changes;
        } else
          origChanges = origChanges || {};

        var model = this.model;
        var docs = model.docs;
        var items;

        var cmd = buildUpdate(this, origChanges);

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

          if (items = self._addItems) {
            var fields = {};
            var atLeast1 = false;
            for(var field in items) {
              var list = attrs[field] || (attrs[field] = []);
              items[field].forEach(function (item) {
                if (util.addItem(list, item) == null) {
                  atLeast1 = true;
                  changes[field + "." + (list.length - 1)] = undefined;
                }
              });
              if (atLeast1) fields[field] = {$each: items[field]};
            }
            if (atLeast1)
              cmd.$addToSet = fields;
          }

          if (items = self._removeItems) {
            var pulls = {};
            for(var field in items) {
              var matches = [], match;
              var list = attrs[field];
              items[field].forEach(function (item) {
                if (list && (match = util.removeItem(list, item)) !== undefined) {
                  changes[field + "." + list.length] = match;
                  matches.push(match);
                }
              });
              if (matches.length)
                pulls[field] = matches.length === 1 ? matches[0] : {$in: matches};
            }
            for (var field in pulls) {
              cmd.$pull = pulls;
              break;
            }
          }

          if (util.isObjEmpty(cmd)) return 0;

          docs.update({_id: doc._id}, cmd);
          model.notify(doc, changes);
        });
        return count;
      },

      findOne: function(id) {
        var opts;
        if (this._sort && ! id) {
          var cursor = this.model.docs.find(buildQuery(this, id));
          cursor.sort(this._sort).limit(1);
          this._fields && cursor.fields(this._fields);
          var doc = cursor.next();
        } else {
          if (this._fields) opts = this._fields;
          var doc = this.model.docs.findOne(buildQuery(this, id), opts);
        }
        if (! doc) return;
        return new this.model(doc);
      },
    });
  };

  function buildQuery(query, id) {
    var result = {};
    var fields;
    if (id = id || query.singleId)
      result._id = id;

    if (fields = query._wheres) for(var key in fields) {
      var value = fields[key];
      if (key[0] !== '$' && util.isArray(value))
        result[key] = {$in: value};
      else
        result[key] = value;
    }

    if (fields = query._whereNots) {
      var neg = {};

      for(var key in fields) {
        var value = fields[key];
        if (util.isArray(value))
          neg[key] = {$nin: value};
        else
          neg[key] = {$ne: value};
      }
      result = {$and: [result, neg]};
    }

    if (query._whereSomes) {
      var ands = result['$and'];
      if (! ands) result = {$and: ands = [result]};
      var somes = query._whereSomes.map(function (ors) {
        ands.push({$or: ors});
      });
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
