define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');
  var defSessState = require('../session/state');
  var Model = require('./base');
  var defSession = require('../session/main');

  function Constructor(sessState, session) {
    return function(Query) {
      var syncOb, stateOb;
      var simDocs = {};

      util.extend(Query, {
        revertSimChanges: function () {
          for (var modelName in simDocs) {
            var model = Model[modelName];
            var modelDocs = model && model.docs;
            if (! modelDocs) continue;
            var docs = simDocs[modelName];
            for(var id in docs) {
              var doc = modelDocs[id];
              var fields = docs[id];
              if (fields === 'new') {
                if (id in modelDocs) {
                  delete modelDocs[id];

                  notify(model, null, doc, true);
                }
              } else {
                var newDoc = ! doc;
                if (newDoc)
                  var doc  = modelDocs[id] = new model({_id: id});
                util.applyChanges(doc.attributes, fields);
                for (var noop in fields) {
                  notify(model, doc, newDoc ? null : fields, true);
                  break;
                }
              }
            }
          }
          simDocs = {};
        },

        insert: function (doc) {
          var model = doc.constructor;
          if (sessState.pendingCount()) {
            simDocsFor(model)[doc._id] = 'new';
          }
          model.docs[doc._id] = doc;
          notify(model, doc, null);
          return doc._id;
        },

        insertFromServer: function (model, id, attrs) {
          if (sessState.pendingCount()) {
            var changes = fromServer(model, id, attrs);
            var doc = model.docs[id];
            if (doc && changes !== attrs) { // found existing
              util.applyChanges(doc.attributes, changes);
              for(var noop in changes) {
                notify(model, doc, changes, true);
                break;
              }
              return doc._id;
            }
          }

          // otherwise new doc
          if (model.docs.hasOwnProperty(id)) {
            // already exists; convert to update
            var old = model.docs[id].attributes;
            for(var key in old) {
              if (attrs.hasOwnProperty(key)) {
                if (util.deepEqual(old[key], attrs[key]))
                  delete attrs[key];
              } else {
                attrs[key] = undefined;
              }
            }
            model.serverQuery.onId(id).update(attrs);
          } else {
            // insert doc
            attrs._id = id;
            var doc = new model(attrs);
            model.docs[doc._id] = doc;
            notify(model, doc, null, true);
          }
        },

        // for testing
        _reset: reset,

        _unload: unload,

        _destroyModel: function (model) {
          delete simDocs[model.modelName];
        },

        get _simDocs() {return simDocs},
      });

      reset();

      util.extend(Query.prototype, {
        withIndex: function (idx, params) {
          this._index = idx(params) || {};
          return this;
        },

        fetch: function () {
          var results = [];
          this.forEach(function (doc) {
            results.push(doc);
          });
          return results;
        },

        fetchIds: function () {
          var results = [];
          this.forEach(function (doc) {
            results.push(doc._id);
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

        show: function (func) {
          func(this);
          return this;
        },

        forEach: function (func) {
          if (this.singleId) {
            var doc = this.findOne(this.singleId);
            doc && func(doc);
          } else {
            if (this._sort) {
              var results = [];
              var compare = sortFunc(this._sort);
              findMatching.call(this, function (doc) {
                results.push(doc);
              });
              results.sort(compare).some(func);

            } else findMatching.call(this, func);
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
          if (! this.model) return 0;
          var docs = this.model.docs;
          this.forEach(function (doc) {
            ++count;
            return count === max;
          });
          return count;
        },

        exists: function () {
          return this.count(1) === 1;
        },

        findOne: function(id) {
          var doc = this.model.docs[id];
          if (! doc) return;
          var attrs = doc.attributes;

          if (this._whereNots && foundIn(this._whereNots, false)) return;

          if (this._wheres && ! foundIn(this._wheres)) return;

          if (this._whereFuncs && this._whereFuncs.some(function (func) {return ! func(doc)}))
            return;

          if (this._whereSomes &&
              ! this._whereSomes.some(function (ors) {
                return ors.some(function (o) {return foundIn(o)});
              })) return;

          return doc;

          function foundIn(fields, affirm) {
            if (affirm === undefined) affirm = true;
            for(var key in fields) {
              if (foundItem(attrs[key], fields[key]) !== affirm)
                return ! affirm;
            }
            return affirm;
          }

          function foundItem(value, expected) {
            if (typeof expected === 'object') {
              if (Array.isArray(expected)) {
                var av = Array.isArray(value);
                for(var i = 0; i < expected.length; ++i) {
                  var exv = expected[i];
                  if (av) {
                    if (value.some(function (item) {return util.deepEqual(item, exv)}))
                      return true;
                  } else if (util.deepEqual(exv, value))
                    return true;
                }
                return false;
              }
              if (Array.isArray(value))
                return value.some(function (item) {return util.deepEqual(item, expected)});

            } else if (Array.isArray(value)) {
              return ! value.every(function (item) {
                return ! util.deepEqual(item, expected);
              });
            }

            return util.deepEqual(expected, value);
          }
        },

        remove: function () {
          var count = 0;
          var self = this;
          var model = self.model;
          var docs = model.docs;
          if (sessState.pendingCount() && self.isFromServer) {
            if (fromServer(model, self.singleId, null) === null) {
              var doc = docs[self.singleId];
              delete docs[self.singleId];
              doc && notify(model, null, doc, self.isFromServer);
            }
            return 1;
          }
          self.forEach(function (doc) {
            ++count;
            Model._callBeforeObserver('beforeRemove', doc);
            if (sessState.pendingCount()) {
              recordChange(model, doc.attributes);
            }
            delete docs[doc._id];
            notify(model, null, doc, self.isFromServer);
          });
          return count;
        },

        update: function (origChanges, value) {
          if (typeof origChanges === 'string') {
            var changes = {};
            changes[origChanges] = value;
            origChanges = changes;
          } else
            origChanges = origChanges || {};

          var self = this;
          var count = 0;
          var model = self.model;
          var docs = model.docs;
          var items;
          if (sessState.pendingCount() && self.isFromServer) {
            var changes = fromServer(model, self.singleId, origChanges);
            var doc = docs[self.singleId];
            if (doc) {
              util.applyChanges(doc.attributes, changes);
              for(var noop in changes) {
                notify(model, doc, changes, self.isFromServer);
                break;
              }
            }
            return 1;
          }
          self.forEach(function (doc) {
            var changes = util.deepCopy(origChanges);
            ++count;
            var attrs = doc.attributes;

            if (self._incs) for (var field in self._incs) {
              changes[field] = attrs[field] + self._incs[field];
            }

            sessState.pendingCount() && recordChange(model, attrs, changes);
            util.applyChanges(attrs, changes);

            var itemCount = 0;

            if (items = self._addItems) for(var field in items) {
              var list = attrs[field] || (attrs[field] = []);
              util.forEach(items[field], function (item) {
                if (util.addItem(list, item) == null) {
                  sessState.pendingCount() && recordItemChange(model, attrs, field);
                  changes[field + ".$-" + ++itemCount] = item;
                }
              });
            }

            if (items = self._removeItems) for(var field in items) {
              var match, list = attrs[field];
              util.forEach(items[field], function (item) {
                if (list && (match = util.removeItem(list, item)) !== undefined) {
                  sessState.pendingCount() && recordItemChange(model, attrs, field);
                  changes[field + ".$+" + ++itemCount] = match;
                }
              });
            }

            for(var key in changes) {
              notify(model, doc, changes, self.isFromServer);
              break;
            }
          });
          return count;
        },
      });

      function notify(model, doc, changes, isFromServer) {
        model._indexUpdate.notify(doc, changes);   // first: update indexes
        isFromServer ||
          Model._callAfterObserver(doc, changes);  // next:  changes originated here
        model.notify(doc, changes);                // last:  Notify everything else
      }

      function findMatching(func) {
        if (! this.model) return;

        if (this._index) {
          findByIndex(this, this._index, func);

        } else for(var id in this.model.docs) {
          var doc = this.findOne(id);
          if (doc && func(doc) === true)
            break;
        }
      }

      function findByIndex(query, idx, func) {
        for(var key in idx) {
          var value = idx[key];
          if (typeof value === 'string') {
            var doc = query.findOne(value);
            if (doc && func(doc) === true)
              return true;

          } else if (findByIndex(query, value, func) === true)
            return true;
        }
      }

      function fromServer(model, id, changes) {
        var modelName = model.modelName;
        var docs = simDocs[modelName];
        if (! docs) return changes;

        if (! changes) {
          return docs[id] = 'new';
        }
        var keys = docs[id];
        if (! keys) return changes;
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
          if (util.isObjEmpty(nc))
            delete docs[id];
          else
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
          util.applyChange(keys, key, changes);
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

      function recordItemChange(model, attrs, key) {
        var docs = simDocsFor(model);
        var keys = docs[attrs._id] || (docs[attrs._id] = {});
        var m = key.match(/^([^.]+)\./);
        if (m) key=m[1];
        if (! keys.hasOwnProperty(key))
          keys[key] = util.deepCopy(attrs[key]);
      }

      function simDocsFor(model) {
        return simDocs[model.modelName] || (simDocs[model.modelName] = {});
      }

      function reset() {
        unload();

        syncOb = sessState.pending.onChange(function (pending) {
          pending || Query.revertSimChanges();
        });

        stateOb = sessState.onChange(function (ready) {
          if (! ready) for(var name in Model) {
            var model = Model[name];
            if (! model) continue;
            var docs = model.docs;
            var sd = simDocs[name] = {};
            for (var id in docs) {
              sd[id] = 'new';
            }
          }
        });
      }

      function unload() {
        syncOb && syncOb.stop();
        stateOb && stateOb.stop();
      }

      function sortFunc(params) {
        return function (a, b) {
          for(var key in params) {
            var aVal = a[key]; var bVal = b[key];
            if (aVal !== bVal) return  (aVal < bVal) ? -params[key]  : params[key];
          }
          return 0;
        };
      }
    };
  }

  exports = Constructor(defSessState, defSession);
  exports.__init__ = Constructor;

  return exports;

});
