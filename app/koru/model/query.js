define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');
  const koru        = require('../main');
  const util        = require('../util');

  const {private$} = require('koru/symbols');

  koru.onunload(module, ()=>{exports._unload && exports._unload()});

  const notifyAC$ = Symbol();

  const foundIn = (attrs, fields, affirm=true)=>{
    for(const key in fields) {
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
  };


  function insertectFunc(param, list) {
    const expected = new Set(list);
    return doc => {
      const value = doc[param];
      return Array.isArray(value) ? value.some(value => expected.has(value)) :
        expected.has(value);
    };
  }


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

  function condition(query, map, params, value) {
    let conditions = query[map];
    if (conditions === undefined) conditions = query[map] = {};

    if (typeof params === 'string')
      conditions[params] = value;
    else
      Object.assign(conditions, params);
    return query;
  }

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

      whereSome(...args) {
        const conditions = (this._whereSomes = this._whereSomes || []);
        conditions.push(args);
        return this;
      }

      whereNot(params, value) {
        return condition(this, '_whereNots', params, value);
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

        return this.map(function (doc) {
          return doc[field];
        });
      }

      fetchIds() {
        return this.fetchField('_id');
      }

      matches(doc, attrs=doc) {
        if (this._whereNots !== undefined && foundIn(attrs, this._whereNots, false)) return false;

        if (this._wheres !== undefined && ! foundIn(attrs, this._wheres)) return false;

        if (this._whereFuncs !== undefined && this._whereFuncs.some(func => ! func(doc)))
          return false;

        if (this._whereSomes !== undefined &&
            ! this._whereSomes.some(
              ors => ors.some(o => foundIn(attrs, o)))) return false;
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
