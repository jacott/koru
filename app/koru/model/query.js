define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');
  const koru        = require('../main');
  const util        = require('../util');

  const {private$} = require('koru/symbols');

  koru.onunload(module, ()=>{exports._unload && exports._unload()});

  const notifyAC$ = Symbol(), func$ = Symbol(), counter$ = Symbol();

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
    $gt(param, obj) {
      const expected = obj.$gt;
      return doc => doc[param] > expected;
    },
    $gte(param, obj) {
      const expected = obj.$gte;
      return doc => doc[param] >= expected;
    },
    $lt(param, obj) {
      const expected = obj.$lt;
      return doc => doc[param] < expected;
    },
    $lte(param, obj) {
      const expected = obj.$lte;
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

  const exprToFunc = (param, value)=>{
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return insertectFunc(param, value);
      }
      for (var key in value) break;
      const expr = EXPRS[key];
      if (typeof expr === 'function') return expr(param, value);
    }
    return value;
  };

  const assignCondition = (conditions, field, value)=>{
    conditions[field] = value;
    const func = exprToFunc(field, value);
    conditions[func$][field] = func === value ? undefined : func;
  };

  const condition = (query, map, params, value)=>{
    if (Array.isArray(params)) {
      let conditions = query[map];
      if (conditions === undefined) conditions = query[map] = [];
      conditions.push(params.map(o => {
        const term = {[func$]: {}};
        for (const field in o)
          assignCondition(term, field, o[field]);
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
      assignCondition(conditions, params, value);

    } else for (const field in params) {
      assignCondition(conditions, field, params[field]);
    }
  };

  function buildList(query, listName, field, values) {
    const items = query[listName] || (query[listName] = {});
    const list = items[field] || (items[field] = []);

    if (Array.isArray(values)) values.forEach(value => list.push(value));
    else list.push(values);

    return query;
  }


  function Constructor(QueryEnv) {
    class Query {
      constructor(model) {
        this.model = model;
      }

      $inspect() {return `{Query ${this.model.modelName}}`}

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

      sort(...fields) {
        if (this._index !== undefined) throw new Error('withIndex may not be used with sort');
        fields = fields.filter(n => n !== 1);
        if (this._sort === undefined)
          this._sort = fields;
        else
          this._sort = this._sort.concat(fields);
        return this;
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
    };

    Query[private$] = {exprToFunc};


    makeSubject(Query, 'onAnyChange', notifyAC$);


    QueryEnv(Query, condition, notifyAC$);

    return Query;
  }

  exports = Constructor(require('../env!./query'));
  exports.__init__ = Constructor;

  return exports;
});
