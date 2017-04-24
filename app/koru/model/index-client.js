define(function(require, exports, module) {
  'use strict';
  const BTree       = require('koru/btree');
  const util        = require('koru/util');
  const makeSubject = require('../make-subject');

  function emptyIdx() {
    const ans = {tmp: 1};
    delete ans.tmp; // deoptimize; try to stop class creations
    return ans;
  }

  return function (model) {
    model._indexUpdate = makeSubject({
      indexes: new Map,
      reloadAll() {
        for(const idx of this.indexes.values()) {
          idx.reload();
        }
      },
    });

    model.addIndex = function (...fields) {
      fields.push('_id');
      return this.addUniqueIndex.apply(this, fields);
    };

    model.addUniqueIndex = (...fields) => {
      let i = 0, comp = null;
      const compKeys = [];
      for(; i < fields.length; ++i) {
        let dir = fields[i];
        if (dir === 1 || dir === -1) {
          const compArgs = fields.slice(i);
          const cLen = compArgs.length;
          for(let i = 0; i < cLen; ++i) {
            const f = compArgs[i];
             switch(f) {
             case 1: case -1: break;
             default: compKeys.push(f);
             }
          }
          comp = (a, b) => {
            let dir = 1;
            for(let i = 0; i < cLen; ++i) {
              const f = compArgs[i];
              switch(f) {
              case 1: dir = 1; break;
              case -1: dir = -1; break;
              default:
                const af = a[f], bf = b[f];
                if (af !== bf) {
                  if (af === undefined) {
                    if (bf === undefined) {
                      return 0;
                    }
                    return -1;
                  }
                  if (bf === undefined) return 1;
                  if (af < bf) return -dir;
                  if (af > bf) return dir;
                }
              }
            }
            return 0;
          };
          break;
        }
      }
      const len = i;
      const btCompare = comp;
      const compKeysLen = compKeys.length;
      const extractKeys = doc => {
        const ans = {};
        for(let i = 0; i < compKeysLen; ++i) {
          const key = compKeys[i];
          ans[key] = doc[key];
        }
        return ans;
      };

      const leadLen = len - 1;
      let dbId = "", idx = null;
      const indexes = {};

      const _tmpModel = new model();

      function tmpModel(doc, changes) {
        _tmpModel.attributes = doc;
        _tmpModel.changes = changes;
        return _tmpModel;
      }

      const uIndex = function (keys) {
        let ret = getIdx();

        for(let i = 0; ret && i < len; ++i) {
          const field = fields[i];
          if (! keys.hasOwnProperty(field)) return ret;
          ret = ret[keys[field]];
        }
        return ret;
      };

      uIndex.fetch = function (keys) {
        const resultIndex = uIndex(keys) || {};

        const docs = model.docs;
        const results = [];
        pushResults(docs, results, resultIndex);
        return results;
      };

      function getIdx() {
        if (model.dbId === dbId)
          return idx;

        dbId = model.dbId;
        idx = indexes[dbId];
        if (idx === undefined) idx = indexes[dbId] = emptyIdx();

        return idx;
      }

      uIndex.reload = function () {
        getIdx();
        idx = indexes[dbId] = {};
        const docs = model.docs;
        for(const id in docs) {
          onChange(docs[id]);
        }
      };

      const handle = model._indexUpdate.onChange(onChange);
      uIndex.stop = handle.stop;
      model._indexUpdate.indexes.set(handle, uIndex);

      function onChange(doc, old) {
        const idx = getIdx();
        if (doc) {
          if (old) {
            let i = 0, tm;
            for(; i < len; ++i) {
              const field = fields[i];
              if (doc[field] !== old[field]) {
                // make a temporary old version
                deleteEntry(idx, tm = tmpModel(doc, old), 0);
                break;
              }
            }
            if (i === len && tm !== undefined) {
              tm = tmpModel(doc, old);
              if (btCompare && btCompare(doc, tm) !== 0) {
                deleteEntry(idx, extractKeys(tm), 0);
              } else
                return;
            }
          }
          let tidx = idx;
          for(let i = 0; i < leadLen; ++i) {
            const value = doc[fields[i]];
            if (value === undefined) return; // FIXME don't index undefined
            tidx = tidx[value] || (tidx[value] = {});
          }
          const value = doc[fields[leadLen]];
          if (btCompare) {
            const tree = tidx[value] || (tidx[value] = new BTree(btCompare));
            tree.add(extractKeys(doc));
          } else {
            tidx[value] = doc._id;
          }
        } else if (old) {
          deleteEntry(idx, old, 0);
        }
      }

      function deleteEntry(tidx, doc, count) {
        const value = doc[fields[count]];
        if (! tidx) return true;
        const entry = tidx[value];
        if (count === leadLen) {
          if (btCompare && entry) {
             entry.delete(doc);
            if (entry.size !== 0)
              return false;
          } else if (entry !== doc._id) return false;
        } else if (! deleteEntry(entry, doc, count+1)) {
          return false;
        }
        delete tidx[value];
        for(const noop in tidx) return false;
        return true;
      }

      uIndex.reload();

      return uIndex;
    };

    function pushResults(docs, results, index) {
      for(const key in index) {
        const value = index[key];
        if (typeof value === 'string')
          results.push(docs[value]);
        else
          pushResults(docs, results, value);
      }
    }
  };
});
