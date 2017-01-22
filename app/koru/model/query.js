define(function(require, exports, module) {
  const koru = require('../main');
  const util = require('../util');

  koru.onunload(module, function () {
    exports._unload && exports._unload();
  });

  function Constructor(QueryEnv) {

    class Query {
      constructor(model) {
        this.model = model;
      }

      onModel(model) {
        this.model = model;
        return this;
      }

      onId(id) {
        this.singleId = id;
        return this;
      }

      inc(field, amount) {
        (this._incs = this._incs || {})[field] = amount || 1;
        return this;
      }

      addItemAnd(field, values) {
        return buildList(this, '_addItems', field, values);
      }

      removeItemAnd(field, values) {
        return buildList(this, '_removeItems', field, values);
      }

      addItem(field, values) {
        return this.addItemAnd(field, values).update();
      }

      removeItem(field, values) {
        return this.removeItemAnd(field, values).update();
      }

      whereSome(...args) {
        const conditions = (this._whereSomes = this._whereSomes || []);
        conditions.push(args);
        return this;
      }

      whereNot(params, value) {
        return condition(this, '_whereNots', params, value);
      }

      fields(/* fields... */) {
        const _fields = this._fields = this._fields || {};
        for(let i = 0; i < arguments.length; ++i) {
          _fields[arguments[i]] = true;
        }
        return this;
      }

      sort(/* fields... */) {
        const _sort = this._sort = this._sort || {};
        for(let i = 0; i < arguments.length; ++i) {
          const val = arguments[i];
          if (typeof val === 'string')
            _sort[val] = 1;
          else
            _sort[arguments[i-1]] = val;
        }
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

    function condition(query, map, params, value) {
      const conditions = (query[map] = query[map] || {});
      if (typeof params === 'string')
        conditions[params] = value;
      else
        util.merge(conditions, params);
      return query;
    }

    function buildList(query, listName, field, values) {
      const items = query[listName] || (query[listName] = {});
      const list = items[field] || (items[field] = []);

      if (Array.isArray(values)) values.forEach(value => list.push(value));
      else list.push(values);

      return query;
    }

    QueryEnv(Query, condition);

    return Query;
  }

  exports = Constructor(require('../env!./query'));
  exports.__init__ = Constructor;

  return exports;
});
