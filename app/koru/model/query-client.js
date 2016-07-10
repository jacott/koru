define(function(require, exports, module) {
  const Model    = require('koru/model/map');
  const session  = require('koru/session/client-rpc');
  const koru     = require('../main');
  const util     = require('../util');
  const dbBroker = require('./db-broker');

  function Constructor(session) {
    return function(Query) {
      var syncOb, stateOb;

      util.extend(Query, {
        revertSimChanges() {
          var dbs = Model._databases[dbBroker.dbId];
          if (! dbs) return;

          for (var modelName in dbs) {
            var model = Model[modelName];
            var modelDocs = model && model.docs;
            if (! modelDocs) continue;
            var docs = dbs[modelName].simDocs;
            if (! docs) continue;
            dbs[modelName].simDocs = Object.create(null);
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
        },

        insert(doc) {
          var model = doc.constructor;
          if (session.state.pendingCount()) {
            simDocsFor(model)[doc._id] = 'new';
          }
          model.docs[doc._id] = doc;
          notify(model, doc, null);
          return doc._id;
        },

        insertFromServer(model, id, attrs) {
          if (session.state.pendingCount()) {
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
          if (model.docs[id]) {
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
      });

      reset();

      util.extend(Query.prototype, {
        get docs() {
          return this._docs || (this._docs = this.model.docs);
        },
        withIndex(idx, params) {
          var orig = dbBroker.dbId;
          dbBroker.dbId = this._dbId || orig;
          this._index = idx(params) || {};
          dbBroker.dbId = orig;
          return this;
        },

        withDB(dbId) {
          var orig = dbBroker.dbId;
          dbBroker.dbId = dbId;
          this._dbId = dbId;
          this._docs = this.model.docs;
          dbBroker.dbId = orig;
          return this;
        },

        fromServer() {
          this.isFromServer = true;
          return this;
        },

        fetch() {
          var results = [];
          this.forEach(function (doc) {
            results.push(doc);
          });
          return results;
        },

        fetchIds() {
          var results = [];
          this.forEach(function (doc) {
            results.push(doc._id);
          });
          return results;
        },

        fetchOne() {
          var result;
          this.forEach(function (doc) {
            result = doc;
            return true;
          });
          return result;
        },

        show(func) {
          func(this);
          return this;
        },

        forEach(func) {
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

        map(func) {
          var results = [];
          this.forEach(function (doc) {
            results.push(func(doc));
          });
          return results;
        },

        count(max) {
          var count = 0;
          if (! this.model) return 0;
          var docs = this.docs;
          this.forEach(function (doc) {
            ++count;
            return count === max;
          });
          return count;
        },

        exists() {
          return this.count(1) === 1;
        },

        findOne(id) {
          var doc = this.docs[id];
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

        remove() {
          var count = 0;
          var self = this;
          var model = self.model;
          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            var docs = this.docs;
            if (session.state.pendingCount() && self.isFromServer) {
              if (fromServer(model, self.singleId, null) === null) {
                var doc = docs[self.singleId];
                delete docs[self.singleId];
                doc && notify(model, null, doc, self.isFromServer);
              }
              return 1;
            }
            self.forEach(doc => {
              ++count;
              Model._support.callBeforeObserver('beforeRemove', doc);
              if (session.state.pendingCount()) {
                recordChange(model, doc.attributes);
              }
              delete docs[doc._id];
              notify(model, null, doc, self.isFromServer);
            });
          });
          return count;
        },

        update(origChanges, value) {
          if (typeof origChanges === 'string') {
            var changes = {};
            changes[origChanges] = value;
            origChanges = changes;
          } else
            origChanges = origChanges || {};

          var self = this;
          var count = 0;
          var model = self.model;
          var docs = this.docs;
          var items;
          if (session.state.pendingCount() && self.isFromServer) {
            var changes = fromServer(model, self.singleId, origChanges);
            var doc = docs[self.singleId];
            if (doc) {
              util.applyChanges(doc.attributes, changes);
              dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
                for(var noop in changes) {
                  notify(model, doc, changes, self.isFromServer);
                  break;
                }
              });
            }
            return 1;
          }
          dbBroker.withDB(this._dbId || dbBroker.dbId, () => {
            self.forEach(function (doc) {
              var changes = util.deepCopy(origChanges);
              ++count;
              var attrs = doc.attributes;

              if (self._incs) for (var field in self._incs) {
                changes[field] = attrs[field] + self._incs[field];
              }

              session.state.pendingCount() && recordChange(model, attrs, changes);
              util.applyChanges(attrs, changes);

              var itemCount = 0;

              if (items = self._addItems) for(var field in items) {
                var list = attrs[field] || (attrs[field] = []);
                util.forEach(items[field], function (item) {
                  if (util.addItem(list, item) == null) {
                    session.state.pendingCount() && recordItemChange(model, attrs, field);
                    changes[field + ".$-" + ++itemCount] = item;
                  }
                });
              }

              if (items = self._removeItems) for(var field in items) {
                var match, list = attrs[field];
                util.forEach(items[field], function (item) {
                  if (list && (match = util.removeItem(list, item)) !== undefined) {
                    session.state.pendingCount() && recordItemChange(model, attrs, field);
                    changes[field + ".$+" + ++itemCount] = match;
                  }
                });
              }

              for(var key in changes) {
                notify(model, doc, changes, self.isFromServer);
                break;
              }
            });
          });
          return count;
        },
      });

      function notify(model, doc, changes, isFromServer) {
        model._indexUpdate.notify(doc, changes); // first: update indexes
        isFromServer ||
          Model._support.callAfterObserver(doc, changes); // next:  changes originated here
        model.notify(doc, changes, isFromServer); // last:  Notify everything else
      }

      function findMatching(func) {
        if (! this.model) return;

        if (this._index) {
          findByIndex(this, this._index, func);

        } else for(var id in this.docs) {
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
        var docs = Model._getProp(model.dbId, modelName, 'simDocs');
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

      function newEmptyObj() {return {}}

      function simDocsFor(model) {
        return Model._getSetProp(model.dbId, model.modelName, 'simDocs', newEmptyObj);
      }

      function reset() {
        unload();

        syncOb = session.state.pending.onChange(function (pending) {
          pending || Query.revertSimChanges();
        });

        stateOb = session.state.onChange(function (ready) {
          if (ready) return;

          var dbs = Model._databases[dbBroker.dbId];
          if (! dbs) return;
          for(var name in dbs) {
            var model = Model[name];
            if (! model) continue;
            var docs = model.docs;
            var sd = dbs[name].simDocs = {};
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

  exports = Constructor(session);
  exports.__init__ = Constructor;

  return exports;

});
