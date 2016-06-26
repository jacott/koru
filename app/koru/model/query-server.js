define(function(require, exports, module) {
  const koru   = require('../main');
  const util   = require('../util');
  const Model  = require('./base');
  const Future = requirejs.nodeRequire('fibers/future');

  return function (Query) {
    util.extend(Query.prototype, {
      withIndex(idx, params) {
        return this.where(params);
      },

      limit(limit) {
        this._limit = limit;
        return this;
      },

      batchSize(size) {
        this._batchSize = size;
        return this;
      },

      fetch() {
        var results = [];
        this.forEach(function (doc) {
          results.push(doc);
        });
        return results;
      },

      waitForOne(timeout) {
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

      fetchIds() {
        if (this.singleId) throw Error('fetchIds onId not supported');

        var model = this.model;
        var cursor = model.docs.find(this, {fields: {_id: 1}});
        applyCursorOptions(this, cursor);

        var results = [];
        try {
          for(var doc = cursor.next(); doc; doc = cursor.next()) {
            results.push(doc._id);
          }
        } finally {
          cursor.close();
        }
        return results;
      },

      show(func) {
        func(this.model.docs.show(this));
        return this;
      },

      forEach(func) {
        var where = this._wheres;
        if (this.singleId) {
          var doc = this.fetchOne();
          doc && func(doc);
        } else {
          var model = this.model;
          var options = {};
          if (this._fields) options.fields = this._fields;
          var cursor = model.docs.find(this, options);
          try {
            applyCursorOptions(this, cursor);
            for(var doc = cursor.next(); doc; doc = cursor.next()) {
              if (func(new model(doc)) === true)
                break;
            }
          } finally {
            cursor.close();
          }

        }
        return this;
      },

      map(func) {
        var results = [];
        this.forEach(function (doc) {
          results.push(func(doc));
        });
        return results;
      },

      remove() {
        var count = 0;
        var model = this.model;
        var docs = model.docs;
        this.forEach(function (doc) {
          ++count;
          Model._callBeforeObserver('beforeRemove', doc);
          docs.remove({_id: doc._id});
          model._$docCacheDelete(doc);
          Model._callAfterObserver(null, doc);
          model.notify(null, doc);
        });
        return count;
      },

      count(max) {
        if (max == null)
          return this.model.docs.count(this);
        else
          return this.model.docs.count(this, {limit: max});
      },

      exists() {
        return this.model.docs.exists(this);
      },

      update(origChanges, value) {
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

          docs.transaction(function (tran) {
            docs.koruUpdate(doc, cmd, dups);

            model._$docCacheSet(doc.attributes);
            tran.onAbort(function () {
              model._$docCacheDelete(doc);
            });
            Model._callAfterObserver(doc, changes);
            model.notify(doc, changes);
          });
        });
        return count;
      },

      fetchOne() {
        var opts;
        if (this._sort && ! this.singleId) {
          var options = {limit: 1};
          if (this._sort) options.sort = this._sort;
          if (this._fields) options.fields = this._fields;
          var cursor = this.model.docs.find(this, options);
          try {
            var doc = cursor.next();
          } finally {
            cursor.close();
          }
        } else {
          if (this._fields) opts = this._fields;
          var doc = this.model.docs.findOne(this, opts);
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
