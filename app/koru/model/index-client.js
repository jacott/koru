define((require)=>{
  'use strict';
  const BTree           = require('koru/btree');
  const DocChange       = require('koru/model/doc-change');
  const Observable      = require('koru/observable');
  const util            = require('koru/util');

  const voidHigh$ = Symbol("voidHigh$");

  const {createDictionary} = util;

  const {compare, hasOwn} = util;
  const nullToUndef= val=>val === null ? void 0 : val;

  return model => {
    model._indexUpdate = new Observable();
    model._indexUpdate.indexes = new Map;
    model._indexUpdate.reloadAll = function () {
      for(const idx of this.indexes.values()) idx.reload();
    };

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
            fields[fields.length-1] : void 0;
      if (condition !== void 0) --fields.length;
      return condition;
    };

    const buildIndex = (_fields, _filterTest) => {
      const fields = _fields;
      let query;
      if (_filterTest !== void 0) {
        query = model.query;
        _filterTest(query);
      }
      const filterTest = query;
      let i = 0, comp = null;
      const compKeys = [], compMethod = [];
      let dbId = "", idx = null;
      const indexes = {};

      const getIdx = ()=>{
        if (model.dbId === dbId)
          return idx;

        dbId = model.dbId;
        idx = indexes[dbId];

        if (idx === void 0) idx = indexes[dbId] =
          leadLen === -1 ? newBTree() : createDictionary();

        return idx;
      };

      const fieldslen = fields.length;
      for(; i < fieldslen; ++i) {
        let dir = fields[i];
        if (dir === 1 || dir === -1) {
          for(let j = i; j < fieldslen; ++j) {
            const f = fields[j];
            switch(f) {
            case 1: case -1: dir = f; break;
            default: {
              const {type} = model.$fields[f];
              compMethod.push(type === 'text'? dir*2 : dir);
              compKeys.push(f);
            }
            }
          }
          const cLen = compKeys.length;
          comp = (a, b) => {
            let dir = 1;
            for(let i = 0; i < cLen; ++i) {
              const f = compKeys[i];
              const af = a[f], bf = b[f];
              if (af === bf) continue;
              const dir = compMethod[i];
              if (af === voidHigh$ || bf === void 0) return 1;
              if (bf === voidHigh$ || af === void 0) return -1;
              if (af.valueOf() !== bf.valueOf()) {
                if (dir < -1 || dir > 1)
                  return compare(af, bf) < 0 ? -dir : dir;
                return af < bf ? -dir : dir;
              }
            }
            return 0;
          };
          break;
        }
      }
      const len = i;
      const btCompare = comp;
      const newBTree = ()=> new BTree(btCompare, true);
      const compKeysLen = compKeys.length;
      const BTValue = (doc, voidHigh=false) => {
        const ans = {};
        for(let i = 0; i < compKeysLen; ++i) {
          const key = compKeys[i];
          const value = doc[key];
          if (value !== void 0) ans[key] = value;
          else if (voidHigh) ans[key] = voidHigh$;
        }
        for (const _ in ans) return ans;
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
        if (tidx === void 0) return true;
        const entry = tidx[value];
        if (count === leadLen) {
          if (btCompare !== null && entry !== void 0) {
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

      const onChange = ({type, doc, was})=>{
        if (type === 'chg' && util.isObjEmpty(was.changes))
          return;
        if (filterTest !== void 0) {
          if (type !== 'del' && ! filterTest.matches(doc)) {
            if (type === 'add') return;
            type = 'del';
          } else if (type === 'chg' && ! filterTest.matches(was))
            type = 'add';
        }

        const idx = getIdx();
        if (type === 'del') {
          if (leadLen === -1) {
            idx.delete(was);
          } else {
            deleteEntry(idx, was, 0);
          }
        } else {
          if (type === 'chg') {
            if (leadLen === -1) {
              const n = idx.nodeFrom(was);

              if (n === null || btCompare(was, n.value) !== 0) {
                idx.add(BTValue(doc));
              } else {
                idx.deleteNode(n);
                n.value = BTValue(doc);
                idx.addNode(n);
              }
              return;
            } else {
              let i = 0;
              for(; i < len; ++i) {
                const field = fields[i];
                if (doc[field] !== was[field]) {
                  deleteEntry(idx, was, 0);
                  break;
                }
              }
              if (i === len) {
                if (btCompare !== null && btCompare(doc, was) !== 0) {
                  deleteEntry(idx, was, 0);
                } else {
                  return;
                }
              }
            }
          }
          if (leadLen === -1) {
            idx.add(BTValue(doc));
          } else {
            let tidx = idx;
            for(let i = 0; i < leadLen; ++i) {
              const value = doc[fields[i]];
              tidx = tidx[value] === void 0 ? (tidx[value] = {}) : tidx[value];
            }
            const value = doc[fields[leadLen]];
            if (btCompare !== null) {
              const tree = tidx[value] === void 0 ?
                      (tidx[value] = newBTree()) : tidx[value];
              tree.add(BTValue(doc));
            } else {
              tidx[value] = doc._id;
            }
          }
        }
      };

      const handle = model._indexUpdate.onChange(onChange);

      const uIndex = {
        filterTest,
        lookup(keys, options) {
          let ret = getIdx();

          for(let i = 0; ret && i < len; ++i) {
            const field = fields[i];
            if (! hasOwn(keys, field)) return ret;
            ret = ret[nullToUndef(keys[field])];
          }

          if (ret !== void 0 && btCompare !== null) {
            const {
              from=keys, to, direction=1,
              excludeFrom=false, excludeTo=false} = options === void 0 ? {} : options;

            return ret.values({from: BTValue(from, ! excludeFrom && direction == -1), to, direction, excludeFrom, excludeTo});
          }

          return ret;
        },
        reload() {
          getIdx();
          idx = indexes[dbId] = leadLen === -1 ? newBTree() : createDictionary();
          const docs = model.docs;
          for(const id in docs) {
            onChange(DocChange.add(docs[id]));
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
