define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');
  const koru        = require('../main');
  const util        = require('../util');

  koru.onunload(module, function () {
    exports._unload && exports._unload();
  });

  const notifyAC$ = Symbol();

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
    };

    makeSubject(Query, 'onAnyChange', notifyAC$);

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

    QueryEnv(Query, condition, notifyAC$);

    return Query;
  }

  exports = Constructor(require('../env!./query'));
  exports.__init__ = Constructor;

  return exports;
});
