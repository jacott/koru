define((require, exports, module)=>{
  const makeSubject     = require('koru/make-subject');
  const Observable      = require('koru/observable');
  const koru            = require('../main');
  const util            = require('../util');

  const {inspect$} = require('koru/symbols');

  const {compare, deepEqual} = util;

  const notifyAC$ = Symbol(), matches$ = Symbol(), func$ = Symbol(),
        compare$ = Symbol(), compareKeys$ = Symbol(),
        onChange$ = Symbol();

  const foundIn = (doc, attrs, fields, affirm=true)=>{
    const funcs = fields[func$];
    for(const func of funcs) {
      if (! func(doc) === affirm)
        return ! affirm;
    }
    const matches = fields[matches$];
    for (const key in matches) {
      if (foundItem(attrs[key], fields[key]) !== affirm)
        return ! affirm;
    }
    return affirm;
  };

  const foundItem = (value, expected)=>{
    if (typeof expected === 'object') {
      if (Array.isArray(expected)) {
        const av = Array.isArray(value);
        for(let i = 0; i < expected.length; ++i) {
          const exv = expected[i];
          if (av) {
            if (value.some(item => deepEqual(item, exv)))
              return true;
          } else if (deepEqual(exv, value))
            return true;
        }
        return false;
      }
      if (Array.isArray(value))
        return value.some(item => deepEqual(item, expected));

    } else if (Array.isArray(value)) {
      return ! value.every(item => ! deepEqual(item, expected));
    }

    return deepEqual(expected, value);
  };

  const EXPRS = {
    $ne(param, obj, key) {
      const expected = obj[key];
      return doc => ! foundItem(doc[param], expected);
    },
    $nin(param, obj) {
      const expected = new Set(obj.$nin);
      return doc => ! expected.has(doc[param]);
    },
    $in(param, obj) {
      return insertectFunc(param, obj.$in);
    },

    $gt(param, obj, key, type) {
      const expected = obj[key];
      if (type === 'text')
        return doc => compare(doc[param], expected) > 0;
      return doc => doc[param] > expected;
    },
    $gte(param, obj, key, type) {
      const expected = obj[key];
      if (type === 'text')
        return doc => compare(doc[param], expected) >= 0;
      return doc => doc[param] >= expected;
    },
    $lt(param, obj, key, type) {
      const expected = obj[key];
      if (type === 'text')
        return doc => compare(doc[param], expected) < 0;
      return doc => doc[param] < expected;
    },
    $lte(param, obj, key, type) {
      const expected = obj[key];
      if (type === 'text')
        return doc => compare(doc[param], expected) <= 0;
      return doc => doc[param] <= expected;
    }
  };

  EXPRS['!='] = EXPRS.$ne;
  EXPRS['>'] = EXPRS.$gt;
  EXPRS['>='] = EXPRS.$gte;
  EXPRS['<'] = EXPRS.$lt;
  EXPRS['<='] = EXPRS.$lte;

  const insertectFunc = (param, list)=>{
    const expected = new Set(list);
    return doc => {
      const value = doc[param];
      return Array.isArray(value) ? value.some(value => expected.has(value)) :
        expected.has(value);
    };
  };

  const exprToFunc = (query, param, value)=>{
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return insertectFunc(param, value);
      }
      let key;
      const fields = query.model.$fields;
      for (key in value) break;
      const expr = EXPRS[key];
      if (expr !== undefined) return expr(param, value, key, fields[param].type);
    }
    return undefined;
  };

  const copyConditions = (type, from, to)=>{
    const f = from[type];
    if (f === undefined) return;
    const t = to[type] || (to[type] = {[func$]: []});
    for (const field in f) {
      t[field] = f[field];
    }
    t[func$].push(...f[func$]);
  };

  const assignCondition = (query, conditions, field, value)=>{
    conditions[field] = value;
    const func = exprToFunc(query, field, value);
    if (func === undefined)
      (conditions[matches$] || (conditions[matches$] = {}))[field] = value;
    else
      conditions[func$].push(func);
  };

  const condition = (query, map, params, value)=>{
    let conditions = query[map];
    if (conditions === undefined) conditions = query[map] = {[func$]: []};
    const type = typeof params;
    if (type === 'function') {
      conditions[func$].push(params);

    } else if (type === 'string') {
      assignCondition(query, conditions, params, value);

    } else for (const field in params) {
      assignCondition(query, conditions, field, params[field]);
    }
  };

  const buildList = (query, listName, field, values)=>{
    const items = query[listName] || (query[listName] = {});
    const list = items[field] || (items[field] = []);

    if (Array.isArray(values)) values.forEach(value => list.push(value));
    else list.push(values);

    return query;
  };


  const __init__ = QueryEnv =>{
    class Query {
      constructor(model) {
        this.model = model;
      }

      [inspect$]() {return `Query(${this.model.modelName})`}

      onModel(model) {
        this.model = model;
        return this;
      }

      onId(id) {
        this.singleId = id;
        return this;
      }

      inc(field, amount) {
        if (this._incs === undefined) this._incs = {};
        this._incs[field] = amount || 1;
        return this;
      }

      addItems(field, values) {
        return this.update({$partial: {[field]: ['$add', values]}});
      }

      removeItems(field, values) {
        return this.update({$partial: {[field]: ['$remove', values]}});
      }

      updatePartial(...args) {
        const $partial = {};
        for(let i = 0; i < args.length; i+=2) {
          $partial[args[i]] = args[i+1];
        }

        return this.update({$partial});
      }

      where(params, value) {
        if (typeof params === 'object' && params !== null && params.constructor === Query) {
          copyConditions('_wheres', params, this);
          copyConditions('_whereNots', params, this);
          const {_whereSomes} = params;
          _whereSomes === undefined ||
            (this._whereSomes || (this._whereSomes = [])).push(..._whereSomes);
        } else
          condition(this, '_wheres', params, value);
        return this;
      }

      whereSome(...args) {
        let conditions = this._whereSomes;
        if (conditions === undefined) conditions = this._whereSomes = [];
        conditions.push(args.map(o => {
          const term = {[func$]: []};
          for (const field in o)
            assignCondition(this, term, field, o[field]);
          return term;
        }));
        return this;
      }

      whereNot(params, value) {
        condition(this, '_whereNots', params, value);
        return this;
      }

      fields(...fields) {
        const _fields = this._fields = this._fields || {};
        for(let i = 0; i < fields.length; ++i) {
          _fields[fields[i]] = true;
        }
        return this;
      }

      limit(limit) {
        this._limit = limit;
        return this;
      }

      sort(...fields) {
        if (this._index !== undefined) throw new Error('withIndex may not be used with sort');
        fields = fields.filter(n => n !== 1);
        if (this._sort === undefined)
          this._sort = fields;
        else
          this._sort = this._sort.concat(fields);
        this[compare$] = undefined;
        return this;
      }

      get compare() {
        if (this[compare$] === undefined) {
          const {_sort} = this;
          if (_sort == null) return undefined;
          const slen = _sort.length, {$fields} = this.model;
          const compKeys = this[compareKeys$] = [], compMethod = [];

          for(let i = 0; i < slen; ++i) {
            const key = _sort[i];
            const dir = i+1 == slen || typeof _sort[i+1] !== 'number' ? 1 : Math.sign(_sort[++i]);
            const {type} = $fields[key];

            compMethod.push(type === 'text'? dir*2 : dir);
            compKeys.push(key);
          }
          if (compKeys[compKeys.length-1] !== '_id') {
            compMethod.push(1);
            compKeys.push('_id');
          }
          const clen = compKeys.length;
          this[compare$] = (a, b) => {
            let dir = 1;
            for(let i = 0; i < clen; ++i) {
              const f = compKeys[i];
              const af = a[f], bf = b[f];
              if (af == null || bf == null ? af !== bf : af.valueOf() !== bf.valueOf()) {
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
        }

        return this[compare$];
      }

      get compareKeys() {
        const {compare} = this;
        return this[compareKeys$];
      }

      reverseSort() {
        const {_sort} = this;
        if (_sort === undefined) return this;
        const ns = [], slen = _sort.length;
        for(let i = 0; i < slen; ++i) {
          if (i+1 == slen || typeof _sort[i+1] !== 'number')
            ns.push(_sort[i], -1);
          else
            ns.push(_sort[i++]);
        }
        this._sort = ns;
        this[compare$] = undefined;
        return this;
      }

      fetchField(field) {
        this.fields(field);

        return this.map(doc => doc[field]);
      }

      fetchIds() {
        return this.fetchField('_id');
      }

      matches(doc, attrs=doc) {
        if (this._whereNots !== undefined && foundIn(doc, attrs, this._whereNots, false))
          return false;

        if (this._wheres !== undefined && ! foundIn(doc, attrs, this._wheres))
          return false;

        if (this._whereSomes !== undefined &&
            ! this._whereSomes.every(
              ors => ors.some(o => foundIn(doc, attrs, o)))) return false;
        return true;
      }

      onChange(callback) {
        if (this[onChange$] === undefined) {
          const subject = this[onChange$] = new Observable(()=>subject.stop());
          subject.stop = this.model.onChange((doc, undo) =>{
            let old = doc != null ? doc.$withChanges(undo) : undo;
            if (doc != null && ! this.matches(doc)) doc = null;
            if (old != null && ! this.matches(old)) old = null;
            if (doc == null && old == null) return;

            subject.notify(doc, doc == null ? old : old && undo);

          }).stop;
        }
        return this[onChange$].onChange(callback);
      }
    };

    makeSubject(Query, 'onAnyChange', notifyAC$);

    QueryEnv(Query, condition, notifyAC$);

    return Query;
  };

  exports = __init__(require('../env!./query'));
  exports.__init__ = __init__;

  module.onUnload(()=>{exports._unload && exports._unload()});

  return exports;
});
