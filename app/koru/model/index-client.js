define(function(require, exports, module) {
  'use strict';
  var util = require('koru/util');
  var makeSubject = require('../make-subject');

  return function (model) {
    model._indexUpdate = makeSubject({
      indexes: {},
      reloadAll: function () {
        var indexes = this.indexes;
        for(var key in indexes) {
          indexes[key].reload();
        }
      },
    });

    model.addIndex = function (...fields) {
      fields.push('_id');
      return this.addUniqueIndex.apply(this, fields);
    };

    model.addUniqueIndex = function (...fields) {
      const len = fields.length;
      const leadLen = len - 1;
      var db;
      var idx;
      var indexes = {};

      const _tmpModel = new model();

      function tmpModel(doc, changes) {
        _tmpModel.attributes = doc;
        _tmpModel.changes = changes;
        return _tmpModel;
      }

      var uIndex = function (keys) {
        var ret = getIdx();

        for(let i = 0; ret && i < len; ++i) {
          if (! keys.hasOwnProperty(fields[i])) return ret;
          ret = ret[keys[fields[i]]];
        }
        return ret;
      };

      uIndex.fetch = function (keys) {
        var resultIndex = uIndex(keys) || {};

        var docs = model.docs;
        var results = [];
        pushResults(docs, results, resultIndex);
        return results;
      };

      function getIdx() {
        if (model.db === db)
          return idx;

        db = model.db;
        idx = indexes[db];
        if (! idx) idx = indexes[db] = {};

        return idx;
      }

      uIndex.reload = function () {
        getIdx();
        idx = indexes[db] = {};
        var docs = model.docs;
        for(let id in docs) {
          onChange(docs[id]);
        }
      };

      var handle = model._indexUpdate.onChange(onChange);
      uIndex.stop = handle.stop;
      model._indexUpdate.indexes[handle.key] = uIndex;
      handle = null;

      function onChange(doc, old) {
        var idx = getIdx();
        if (doc) {
          if (old) {
            for(let i = 0; i < len; ++i) {
              var field = fields[i];
              if (old.hasOwnProperty(field) && doc[field] != old[field]) {
                // make a temporary old version
                deleteEntry(idx, tmpModel(doc, old), 0);
                break;
              }
            }
            if (i === len) return;
          }
          var tidx = idx;
          for(var i = 0; i < leadLen; ++i) {
            var value = doc[fields[i]];
            tidx = tidx[value] || (tidx[value] = {});
          }
          var value = doc[fields[leadLen]];
          tidx[value] = doc._id;
        } else if (old) {
          deleteEntry(idx, old, 0);
        }
      }

      function deleteEntry(tidx, doc, count) {
        var value  = doc[fields[count]];
        if (! tidx) return true;
        if (count === leadLen) {
          if (tidx[value] !== doc._id) return false;
        } else if (! deleteEntry(tidx[value], doc, count+1)) {
          return false;
        }
        delete tidx[value];
        for(var noop in tidx) return false;
        return true;
      }

      uIndex.reload();

      return uIndex;
    };

    function pushResults(docs, results, index) {
      for(var key in index) {
        var value = index[key];
        if (typeof value === 'string')
          results.push(docs[value]);
        else
          pushResults(docs, results, value);
      }
    }
  };
});
