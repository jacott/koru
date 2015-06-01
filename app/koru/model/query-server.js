define(function(require, exports, module) {
  var util = require('../util');
  var mongodb = require('../mongo/driver');
  var koru = require('../main');
  var Model = require('./base');
  var Future = requirejs.nodeRequire('fibers/future');

  return function (Query) {
    util.extend(Query.prototype, {
      withIndex: function (idx, params) {
        return this.where(params);
      },

      limit: function (limit) {
        this._limit = limit;
        return this;
      },

      batchSize: function (size) {
        this._batchSize = size;
        return this;
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

      waitForOne: function (timeout) {
        timeout = timeout || 2000;
        var query = this;
        var future = new Future;
        try {
          var handle = this.model.onChange(function () {
            var doc = query.fetchOne();
            if (doc) future.return(doc);
          });
          var doc = this.fetchOne();
          if (doc) return doc;
          var timer = koru.setTimeout(function () {
            future.return();
          }, timeout);
          return future.wait();
        } finally {
          handle.stop();
          timer && koru.clearTimeout(timer);
        }
      },

      fetchIds: function () {
        if (this.singleId) throw Error('fetchIds onId not supported');

        var model = this.model;
        var cursor = model.docs.find(buildQuery(this), {fields: {_id: 1}});
        applyCursorOptions(this, cursor);

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
          var options = {};
          if (this._fields) options.fields = this._fields;
          var cursor = model.docs.find(buildQuery(this), options);
          applyCursorOptions(this, cursor);
          for(var doc = cursor.next(); doc; doc = cursor.next()) {
            if (func(new model(doc)) === true)
              break;
          }
        }
        return this;
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
          Model._callBeforeObserver('beforeRemove', doc);
          docs.remove({_id: doc._id});
          model._$removeWeakDoc(doc, 'force');
          Model._callAfterObserver(null, doc);
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

      exists: function () {
        return this.model.docs.exists(buildQuery(this));
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

          var itemCount = 0;

          if (items = self._addItems) {
            var fields = {};
            var atLeast1 = false;
            for(var field in items) {
              var list = attrs[field] || (attrs[field] = []);
              util.forEach(items[field], function (item) {
                if (util.addItem(list, item) == null) {
                  atLeast1 = true;
                  changes[field + ".$-" + ++itemCount] = item;
                }
              });
              if (atLeast1) fields[field] = {$each: items[field]};
            }
            if (atLeast1)
              cmd.$addToSet = fields;
          }

          if (items = self._removeItems) {
            var pulls = {};
            var dups = {};
            for(var field in items) {
              var matches = [], match;
              var list = attrs[field];
              util.forEach(items[field], function (item) {
                if (list && (match = util.removeItem(list, item)) !== undefined) {
                  changes[field + ".$+" + ++itemCount] = match;
                  matches.push(match);
                }
              });
              if (matches.length) {
                var upd = matches.length === 1 ? matches[0] : {$in: matches};
                if (fields && fields.hasOwnProperty(field))
                  dups[field] = upd;
                else
                  pulls[field] = upd;
              }
            }
            for (var field in pulls) {
              cmd.$pull = pulls;
              break;
            }
          }

          if (util.isObjEmpty(cmd)) return 0;

          docs.koruUpdate(doc, cmd, dups);

          model._$setWeakDoc(doc.attributes);
          Model._callAfterObserver(doc, changes);
          model.notify(doc, changes);
        });
        return count;
      },

      findOne: function(id) {
        var opts;
        if (this._sort && ! id) {
          var options = {limit: 1};
          if (this._sort) options.sort = this._sort;
          if (this._fields) options.fields = this._fields;
          var cursor = this.model.docs.find(buildQuery(this, id), options);
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

  function applyCursorOptions(query, cursor) {
    query._batchSize && cursor.batchSize(query._batchSize);
    query._limit && cursor.limit(query._limit);
    query._sort && cursor.sort(query._sort);
  }

  function buildQuery(query, id) {
    var result = {};
    var fields;
    if (id = id || query.singleId)
      result._id = id;

    query._wheres && foundIn(query._wheres, result);

    if (fields = query._whereNots) {
      var neg = {};

      for(var key in fields) {
        var value = fields[key];
        if (Array.isArray(value))
          neg[key] = {$nin: value};
        else
          neg[key] = {$ne: value};
      }
      if (util.isObjEmpty(result))
        result = neg;
      else
        result = {$and: [result, neg]};
    }

    if (query._whereSomes) {
      var ands = result['$and'];
      if (! ands) {
        if (util.isObjEmpty(result))
          result = {$and: ands = []};
        else
          result = {$and: ands = [result]};
      }
      var somes = query._whereSomes.map(function (ors) {
        ands.push({$or: ors.map(function (fields) {
          return foundIn(fields, {});
        })});
      });
    }

    return result;

    function foundIn(fields, result) {
      for(var key in fields) {
        var value = fields[key];
        if (key[0] !== '$' && Array.isArray(value))
          result[key] = {$in: value};
        else
          result[key] = value;
      }
      return result;
    }
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
