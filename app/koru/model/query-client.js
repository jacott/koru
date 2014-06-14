define(function(require, exports, module) {
  var util = require('../util');
  var session = require('../session/base');
  var env = require('../env');

  env.onunload(module, function () {
    sessionOb && sessionOb.stop();
    sessionOb = null;
  });

  var sessionOb, recording;
  var desc = {value: null};

  return function(Query) {
    var simDocs = {};

    sessionOb && sessionOb.stop();
    sessionOb = session.rpc.onChange(function (waiting) {
      recording = waiting;
      waiting || Query.revertSimChanges();
    });

    util.extend(Query, {
      get _simDocs() {return simDocs},

      revertSimChanges: function () {
        for (var modelName in simDocs) {
          var docs = simDocs[modelName];
          var model = docs[0];
          var modelDocs = model.docs;
          docs = docs[1];
          for(var id in docs) {
            var doc = modelDocs[id];
            var fields = docs[id];
            if (fields === 'new') {
              if (id in modelDocs) {
                delete modelDocs[id];

                model.notify(null, doc);
              }
            } else {
              var newDoc = ! doc;
              if (newDoc)
                var doc  = modelDocs[id] = new model({_id: id});
              util.applyChanges(doc.attributes, fields);
              for (var noop in fields) {
                model.notify(doc, newDoc ? null : fields);
                break;
              }
            }
          }
        }
        simDocs = {};
      },

      insert: function (doc) {
        var model = doc.constructor;
        if (recording) {
          simDocsFor(model)[doc._id] = 'new';
        }
        model.docs[doc._id] = doc;
        model.notify(doc, null);
        return doc._id;
      },

      insertFromServer: function (model, id, attrs) {
        if (recording) {
          var changes = fromServer(model, id, attrs);
          var doc = model.docs[id];
          if (doc && changes !== attrs) { // found existing
            util.applyChanges(doc.attributes, changes);
            for(var noop in changes) {
              model.notify(doc, changes);
              break;
            }
            return doc._id;
          }
        }
        // otherwise new doc
        attrs._id = id;
        var doc = new model(attrs);
        model.docs[doc._id] = doc;
        model.notify(doc, null);
      },
    });

    util.extend(Query.prototype, {
      fromServer: function (id) {
        this.singleId = id;
        this._fromServer = true;
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
        var result;
        this.forEach(function (doc) {
          result = doc;
          return true;
        });
        return result;
      },

      forEach: function (func) {
        var where = this._wheres;
        var whereNot = this._whereNots;
        if (this.singleId) {
          var doc = this.findOne(this.singleId);
          doc && func(doc);
        } else for(var id in this.model.docs) {
          // TODO use indexs to speed this up: say query.withIndex('abc', {params...}).
          var doc = this.findOne(id);
          if (doc && func(doc) === true)
            break;
        }
      },

      map: function (func) {
        var results = [];
        this.forEach(function (doc) {
          results.push(func(doc));
        });
        return results;
      },

      count: function (max) {
        var count = 0;
        var docs = this.model.docs;
        this.forEach(function (doc) {
          ++count;
          return count === max;
        });
        return count;
      },

      findOne: function(id) {
        var doc = this.model.docs[id];
        if (! doc) return;
        var attrs = doc.attributes;
        var whereNot = this._whereNots;
        if (whereNot) for(var field in whereNot) {
          if (attrs[field] == whereNot[field])
            return;
        }
        var where = this._wheres;
        if (where) for(var field in where) {
          if (attrs[field] != where[field])
            return;
        }
        return doc;
      },

      remove: function () {
        var count = 0;
        var model = this.model;
        var docs = model.docs;
        if (recording && this._fromServer) {
          if (fromServer(model, this.singleId, null) === null) {
            var doc = docs[this.singleId];
            delete docs[this.singleId];
            model.notify(null, doc);
          }
          return 1;
        }
        this.forEach(function (doc) {
          ++count;
          if (recording) {
            recordChange(model, doc.attributes);
          }
          delete docs[doc._id];
          model.notify(null, doc);
        });
        return count;
      },

      update: function (changes) {
        var self = this;
        var count = 0;
        var model = self.model;
        var docs = model.docs;
        if (recording && self._fromServer) {
          changes = fromServer(model, self.singleId, changes);
          var doc = docs[self.singleId];
          if (doc) {
            util.applyChanges(doc.attributes, changes);
            for(var noop in changes) {
              model.notify(doc, changes);
              break;
            }
          }
          return 1;
        }
        self.forEach(function (doc) {
          ++count;
          var attrs = doc.attributes;

          if (self._incs) for (var field in self._incs) {
            attrs[field] += self._incs[field];
          }

          var valueUndefined = {value: undefined};
          recording && recordChange(model, attrs, changes);
          util.applyChanges(attrs, changes);
          for(var key in changes) {
            model.notify(doc, changes);
            break;
          }
        });
        return count;
      },

    });

    function fromServer(model, id, changes) {
      var modelName = model.modelName;
      var docs = simDocs[modelName];
      if (! docs) return changes;
      docs = docs[1];
      var keys = docs && docs[id];
      if (!keys) return changes; // no sim value

      if (! changes) {
        return docs[id] = 'new';
      }

      if (keys === 'new') {
        changes = util.deepCopy(changes);
        delete changes._id;
        var nc = {};
        var doc = model.docs[id];
        if (doc) for (var key in doc.attributes) {
          if (key === '_id') continue;
          if (! changes.hasOwnProperty(key))
            nc[key] = undefined;
        }
        docs[id] = nc;

        return changes;
      }

      var nc = {};

      for (var key in changes) {
        if (key === '_id') continue;
        var m = key.match(/^([^.]+)\./);
        m = m ? m[1] : key;

        if (! keys.hasOwnProperty(m)) {
          nc[key] = changes[key];
        }
        desc.value = changes[key];
        util.applyChange(keys, key, desc);
      }

      return nc;
    }

    function recordChange(model, attrs, changes) {
      var docs = simDocsFor(model);
      var keys = docs[attrs._id] || (docs[attrs._id] = {});
      if (changes) {
        for (var key in changes) {
          var m = key.match(/^([^.]+)\./);
          if (m) key=m[1];
          if (! keys.hasOwnProperty(key))
            keys[key] = util.deepCopy(attrs[key]);
        }
      } else {
        // remove
        for (var key in attrs) {
          if (! (key === '_id' || keys.hasOwnProperty(key)))
            keys[key] = util.deepCopy(attrs[key]);
        }
      }
    }

    function simDocsFor(model) {
      return (simDocs[model.modelName] || (simDocs[model.modelName] = [model, {}]))[1];
    }
  };
});
