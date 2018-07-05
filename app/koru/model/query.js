define((require, exports, module)=>{
  const makeSubject = require('koru/make-subject');
  const koru        = require('../main');
  const util        = require('../util');

  const {inspect$} = require('koru/symbols');

  const {compare} = util;

  const notifyAC$ = Symbol(), func$ = Symbol(), counter$ = Symbol(),
        compare$ = Symbol(), compareKeys$ = Symbol(),
        onChange$ = Symbol();

  const foundIn = (doc, attrs, fields, affirm=true)=>{
    const funcs = fields[func$];
    for(const key in funcs) {
      const func = funcs[key];
      if (func === undefined) {
        if (foundItem(attrs[key], fields[key]) !== affirm)
          return ! affirm;
      } else if (! func(doc) === affirm)
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
            if (value.some(item => util.deepEqual(item, exv)))
              return true;
          } else if (util.deepEqual(exv, value))
            return true;
        }
        return false;
      }
      if (Array.isArray(value))
        return value.some(item => util.deepEqual(item, expected));

    } else if (Array.isArray(value)) {
      return ! value.every(item => ! util.deepEqual(item, expected));
    }

    return util.deepEqual(expected, value);
  };

  const EXPRS = {
    $ne(param, obj) {
      const expected = obj.$ne;
      return doc => ! foundItem(doc[param], expected);
    },
    $nin(param, obj) {
      const expected = new Set(obj.$nin);
      return doc => ! expected.has(doc[param]);
    },
    $in(param, obj) {
      return insertectFunc(param, obj.$in);
    },

    $gt(param, obj, {model: {$fields: {[param]: {type}}}}) {
      const expected = obj.$gt;
      if (type === 'text')
        return doc => compare(doc[param], expected) > 0;
      return doc => doc[param] > expected;
    },
    $gte(param, obj, {model: {$fields: {[param]: {type}}}}) {
      const expected = obj.$gte;
      if (type === 'text')
        return doc => compare(doc[param], expected) >= 0;
      return doc => doc[param] >= expected;
    },
    $lt(param, obj, {model: {$fields: {[param]: {type}}}}) {
      const expected = obj.$lt;
      if (type === 'text')
        return doc => compare(doc[param], expected) < 0;
      return doc => doc[param] < expected;
    },
    $lte(param, obj, {model: {$fields: {[param]: {type}}}}) {
      const expected = obj.$lte;
      if (type === 'text')
        return doc => compare(doc[param], expected) <= 0;
      return doc => doc[param] <= expected;
    }
  };

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
      for (var key in value) break;
      const expr = EXPRS[key];
      if (typeof expr === 'function') return expr(param, value, query);
    }
    return value;
  };

  const assignCondition = (query, conditions, field, value)=>{
    conditions[field] = value;
    const func = exprToFunc(query, field, value);
    conditions[func$][field] = func === value ? undefined : func;
  };

  const condition = (query, map, params, value)=>{
    if (Array.isArray(params)) {
      let conditions = query[map];
      if (conditions === undefined) conditions = query[map] = [];
      conditions.push(params.map(o => {
        const term = {[func$]: {}};
        for (const field in o)
          assignCondition(query, term, field, o[field]);
        return term;
      }));
      return;
    }

    let conditions = query[map];
    if (conditions === undefined) conditions = query[map] = {[func$]: {}};
    const type = typeof params;
    if (type === 'function') {
      const count = conditions[counter$] = (conditions[counter$] || 0) + 1;
      conditions[func$][count] = params;

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

      [inspect$]() {return `{Query ${this.model.modelName}}`}

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
        condition(this, '_wheres', params, value);
        return this;
      }

      whereSome(...args) {
        condition(this, '_whereSomes', args);
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
          const subject = this[onChange$] = makeSubject({stop: this.model.onChange((doc, undo) =>{
            let old = doc != null ? doc.$withChanges(undo) : undo;
            if (doc != null && ! this.matches(doc)) doc = null;
            if (old != null && ! this.matches(old)) old = null;
            if (doc == null && old == null) return;

            subject.notify(doc, doc == null ? old : old && undo);

          }).stop}, 'onChange', 'notify', {
            allStopped(subject) {subject.stop()}
          });

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
