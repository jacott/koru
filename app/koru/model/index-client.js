define(function(require, exports, module) {
  const BTree       = require('koru/btree');
  const util        = require('koru/util');
  const makeSubject = require('../make-subject');

  const emptyIdx = ()=>{
    const ans = {tmp: null};
    delete ans.tmp; // deoptimize; try to stop class creations
    return ans;
  };

  return model => {
    model._indexUpdate = makeSubject({
      indexes: new Map,
      reloadAll() {
        for(const idx of this.indexes.values()) {
          idx.reload();
        }
      },
    });

    model.addIndex = (...fields) => {
      const condition = extractCondition(fields);
      fields.push('_id');
      return buildIndex(fields, condition);
    };

    model.addUniqueIndex = (...fields) => {
      const condition = extractCondition(fields);
      return buildIndex(fields, condition);
    };

    const extractCondition = fields=>{
      const condition = typeof fields[fields.length-1] === 'function' ?
              fields[fields.length-1] : null;
      if (condition !== null) --fields.length;
      return condition;
    };

    const buildIndex = (_fields, _condition) => {
      const fields = _fields, condition = _condition;
      let i = 0, comp = null;
      const compKeys = [];
      let dbId = "", idx = null;
      const indexes = {};

      const getIdx = ()=>{
        if (model.dbId === dbId)
          return idx;

        dbId = model.dbId;
        idx = indexes[dbId];

        if (idx === undefined) idx = indexes[dbId] =
          leadLen === -1 ? new BTree(btCompare) : emptyIdx();

        return idx;
      };

      const fieldslen = fields.length;
      for(; i < fieldslen; ++i) {
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
      const BTValue = doc => {
        const ans = {};
        for(let i = 0; i < compKeysLen; ++i) {
          const key = compKeys[i];
          ans[key] = doc[key];
        }
        return ans;
      };

      const leadLen = len - 1;

      const _tmpModel = new model();
      const tmpModel = (doc, changes)=>{
        _tmpModel.attributes = doc;
        _tmpModel.changes = changes;
        return _tmpModel;
      };

      const deleteEntry = (tidx, doc, count)=>{
        const value = doc[fields[count]];
        if (tidx === undefined) return true;
        const entry = tidx[value];
        if (count === leadLen) {
          if (btCompare !== null && entry !== undefined) {
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
      };

      const onChange = (doc, old)=>{
        const idx = getIdx();
        if (condition !== null && doc != null && ! condition(doc)) {
          old = doc; doc = null;
        }

        if (doc != null) {
          if (old != null) {
            if (leadLen === -1) {
              const tm = tmpModel(doc, old);
              const n = idx.nodeFrom(tm);

              if (n === null || btCompare(tm, n.value) !== 0) {
                idx.add(BTValue(doc));
              } else {
                idx.deleteNode(n);
                n.value = BTValue(doc);
                idx.addNode(n);
              }
              return;
            } else {
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
                if (btCompare !== null && btCompare(doc, tm) !== 0) {
                  deleteEntry(idx, BTValue(tm), 0);
                } else
                  return;
              }
            }
          }
          if (leadLen === -1) {
            idx.add(BTValue(doc));
          } else {
            let tidx = idx;
            for(let i = 0; i < leadLen; ++i) {
              const value = doc[fields[i]];
              if (value === undefined) return;
              tidx = tidx[value] === undefined ? (tidx[value] = {}) : tidx[value];
            }
            const value = doc[fields[leadLen]];
            if (btCompare !== null) {
              const tree = tidx[value] === undefined ?
                      (tidx[value] = new BTree(btCompare)) : tidx[value];
              tree.add(BTValue(doc));
            } else {
              tidx[value] = doc._id;
            }
          }
        } else if (old != null) {
          if (leadLen === -1) {
            idx.delete(old);
          } else {
            deleteEntry(idx, old, 0);
          }
        }
      };


      const handle = model._indexUpdate.onChange(onChange);

      const uIndex = {
        lookup(keys, options) {
          let ret = getIdx();

          for(let i = 0; ret && i < len; ++i) {
            const field = fields[i];
            if (keys[field] === undefined) return ret;
            ret = ret[keys[field]];
          }

          if (ret !== undefined && btCompare !== null) {
            const {
              from=BTValue(keys), to, direction=1,
              excludeFrom=false, excludeTo=false} = options === undefined ? {} : options;
            return ret.cursor({from, to, direction, excludeFrom, excludeTo});
          }

          return ret;
        },
        reload() {
          getIdx();
          idx = indexes[dbId] = leadLen === -1 ? new BTree(btCompare) : emptyIdx();
          const docs = model.docs;
          for(const id in docs) {
            onChange(docs[id]);
          }
        },

        stop: handle.stop,
      };

      Object.defineProperty(uIndex, 'entries', {get: getIdx, enumerable: false});

      model._indexUpdate.indexes.set(handle, uIndex);

      uIndex.reload();

      return uIndex;
    };
  };
});
