define((require, exports, module)=>{
  const BTree           = require('koru/btree');
  const DocChange       = require('koru/model/doc-change');
  const Observable      = require('koru/observable');
  const util            = require('koru/util');

  const emptyIdx = ()=>{
    const ans = {tmp: null};
    delete ans.tmp; // deoptimize; try to stop class creations
    return ans;
  };

  const {compare, hasOwn} = util;
  const nullToUndef= val=>val === null ? undefined : val;

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
              fields[fields.length-1] : null;
      if (condition !== null) --fields.length;
      return condition;
    };

    const buildIndex = (_fields, _filterTest) => {
      const fields = _fields;
      let query = null;
      if (_filterTest !== null) {
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

        if (idx === undefined) idx = indexes[dbId] =
          leadLen === -1 ? new BTree(btCompare) : emptyIdx();

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
              if ((af === undefined || bf === undefined) ? af != bf
                  : af.valueOf() !== bf.valueOf()) {
                const dir = compMethod[i];
                if (af === undefined) return -1;
                if (bf === undefined) return 1;
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
      const compKeysLen = compKeys.length;
      const BTValue = doc => {
        const ans = {};
        for(let i = 0; i < compKeysLen; ++i) {
          const key = compKeys[i];
          const value = doc[key];
          if (value !== undefined) ans[key] = value;
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

      const onChange = ({type, doc, was})=>{
        const idx = getIdx();
        if (filterTest !== null) {
          let nt = type;
          if (type !== 'del' && ! filterTest.matches(doc)) nt = 'del';
          if (type !== 'add' && ! filterTest.matches(was)) nt = 'add';
          if (type === 'add' && nt === 'del') return;
          type = nt;
        }

        if (type === 'del') {
          if (leadLen === -1) {
            idx.delete(was);
          } else {
            deleteEntry(idx, was, 0);
          }
        } else {
          if (type !== 'add') {
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

          if (ret !== undefined && btCompare !== null) {
            const {
              from=BTValue(keys), to, direction=1,
              excludeFrom=false, excludeTo=false} = options === undefined ? {} : options;
            return ret.values({from, to, direction, excludeFrom, excludeTo});
          }

          return ret;
        },
        reload() {
          getIdx();
          idx = indexes[dbId] = leadLen === -1 ? new BTree(btCompare) : emptyIdx();
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
