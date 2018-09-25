define((require)=>{
  const Changes         = require('koru/changes');

  const {inspect, hasOwn} = require('koru/util');

  const {inspect$}      = require('koru/symbols');

  const changes$ = Symbol(), id$ = Symbol(), type$ = Symbol(), undo$ = Symbol(), doc$ = Symbol();

  const NOT_ALLOWED = 'illegal call';

  const fullType = {
    add: 'add',
    chg: 'change',
    del: 'delete',
  };

  const setContents = (dc, id, type, doc, undo)=>{
    if (dc[type$] !== type) {
      dc[type$] = type;
      if (type !== 'chg') {
        dc[undo$] = type === 'del' ? 'add' : 'del';
      }
    }

    if (type !== 'chg') {
      dc._set(doc);
    } else {
      dc._set(doc, undo);
    }
    dc[id$] = id;
    return dc;
  };

  class DocChange {
    constructor(type, doc, undo, flag) {
      this[type$] = type;
      this[doc$] = doc;
      this[undo$] = type === 'chg' ? undo : type === 'add' ? 'del' : 'add';
      this.flag = flag;
      if (doc != null) this[id$] = doc._id;
    }
    static add(doc, flag) {return new DocChange('add', doc, undefined, flag)}
    static delete(doc, flag) {return new DocChange('del', doc, undefined, flag)}
    static change(doc, undo, flag) {return new DocChange('chg', doc, undo, flag)}

    clone() {
      const copy = new DocChange(this[type$], this[doc$], this[undo$], this.flag);
      copy[id$] = this[id$];
      if (this[changes$] !== undefined) copy[changes$] = this[changes$];
      return copy;
    }

    _set(doc, undo) {
      if (this[changes$] !== undefined) this[changes$] = undefined;
      this[doc$] = doc;
      this[id$] = doc._id;
      if (this[type$] === 'chg') this[undo$] = undo;
      return this;
    }

    [inspect$]() {
      return `DocChange.${fullType[this[type$]]}(${inspect(this[doc$])}`+
        `${this[type$] === 'chg' ? ', '+inspect(this[undo$]) : ''}, ${inspect(this.flag)})`;
    }

    get type() {return this[type$]} set type(v) {throw new Error(NOT_ALLOWED)}
    get doc() {return this[doc$]} set doc(v) {throw new Error(NOT_ALLOWED)}
    get undo() {return this[undo$]} set undo(v) {throw new Error(NOT_ALLOWED)}

    get isAdd() {return this[type$] === 'add'}
    get isDelete() {return this[type$] === 'del'}
    get isChange() {return this[type$] === 'chg'}
    get _id() {return this[id$]}

    get model() {return this[doc$].constructor}
    get was() {return this[doc$].$withChanges(this[undo$])}

    hasField(field) {
      const undo = this[undo$];
      if (typeof undo !== 'string')
        return Changes.has(undo, field);

      const doc = this[doc$];
      return doc[field] !== undefined;
    }

    hasSomeFields(...fields) {
      for(let i = 0; i < fields.length; ++i) {
        if (this.hasField(fields[i])) return true;
      }

      return false;
    }

    get changes() {
      return this[changes$] || (this[changes$] = this[doc$].$invertChanges(this[undo$]));
    }

    *subDocKeys(field) {
      const undo = this[undo$];
      if (undo.hasOwnProperty(field)) {
        // top level
        const was = undo[field], now = this[doc$][field];

        if (now === undefined) {
          for (const k in was) yield k;
        } else {
          for (const k in was) if (now[k] === undefined) yield k;
          for (const k in now) yield k;
        }
        return;
      }

      const u = undo.$partial[field];

      for(let i = 0; i < u.length; i+=2) {
        const k = u[i];
        if (k === '$replace') {
          const was = u[i+1] || {}, now = this[doc$][field];

          for (const k in was) if (now[k] === undefined) yield k;
          for (const k in now) if (was[k] === undefined) yield k;
          return;

        } else {
          const idx = k.indexOf('.');
          yield idx === -1 ? k : k.slice(0, idx);
        }
      }
    }

    *subDocs(field, flag) {
      const undo = this[undo$];
      const dc = new DocChange('chg');
      if (flag !== undefined) dc.flag = flag;
      if (undo.hasOwnProperty(field) || undo.$partial === undefined) {
        // top level
        const was = undo[field], now = this[doc$][field];

        if (now === null || typeof now !== 'object') {
          for (const k in was) yield setContents(dc, k, 'del', was[k]);

        } else if (was === null || typeof was !== 'object') {
          for (const k in now) yield setContents(dc, k, 'add', now[k]);

        } else {
          for (const k in was)
            if (now[k] === undefined) yield setContents(dc, k, 'del', was[k]);

          for (const k in now) {
            if (was[k] === undefined)
              yield setContents(dc, k, 'add', now[k]);
            else
              yield setContents(dc, k, 'chg', now[k], {$partial: {$replace: was[k]}});
          }
        }
        return;
      }

      const u = undo.$partial[field];
      if (! Array.isArray(u)) return;

      const now = this[doc$][field] || {};

      const composite = {};

      for(let i = 0; i < u.length; i+=2) {
        const k = u[i];
        if (k === '$replace') {
          const was = u[i+1] || {};

          for (const k in was)
            if (now[k] === undefined) yield setContents(dc, k, 'del', was[k]);
          for (const k in now) {
            if (was[k] === undefined)
              yield setContents(dc, k, 'add', now[k]);
            else
              yield setContents(dc, k, 'chg', now[k], {$partial: {$replace: was[k]}});
          }
          return;

        } else {
          const idx = k.indexOf('.');
          if (idx == -1) {
            const ov = u[i+1];
            const nv = now[k];
            if (ov == null)
              yield setContents(dc, k, 'add', nv);
            else {
              if (nv == null)
                yield setContents(dc, k, 'del', ov);
              else {
                yield setContents(dc, k, 'chg', now[k], ov);
              }
            }
          } else {
            const id = k.slice(0, idx);
            const rem = k.slice(idx+1);
            if (rem === '$partial') {
              const cmd = u[i+1];
              if (Array.isArray(cmd)) {
                if (cmd[0] === '$replace' && cmd[1] == null)
                  yield setContents(dc, id, 'add', now[id]);
                else {
                  const undo = {};
                  for(let j = 0; j < cmd.length; j+=2) {
                    const idx = k.indexOf('.');
                    const field = cmd[j];
                    const v = cmd[j+1];
                    const fidx = field.indexOf(".");
                    if (fidx === -1)
                      undo[field] = Array.isArray(v) ? ['$replace', v] : v;
                    else
                      undo[field.slice(0, fidx)] = v;
                  }
                  yield setContents(dc, id, 'chg', now[id], {$partial: undo});
                }
              }
            } else {
              const ov = composite[id] || (composite[id] = {});
              const ridx = rem.indexOf(".");
              if (ridx === -1) {
                ov[rem] = u[i+1];
              } else {
                const sr = rem.slice(ridx+1);
                if (sr === '$partial') {
                  ov[rem] = u[i+1];
                } else {
                  const sw = rem.slice(0, ridx);
                  const su = ov[sw] || (ov[sw] = []);
                  su.push(rem.slice(ridx+1), u[i+1]);
                }
              }
            }
          }
        }
      }

      for (const id in composite) {
        yield setContents(dc, id, 'chg', now[id], {$partial: composite[id]});
      }
    }
  }

  return DocChange;
});
