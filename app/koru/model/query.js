define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');

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

      where(params, value) {
        if (typeof params === 'function') {
          var funcs = this._whereFuncs || (this._whereFuncs = []);
          funcs.push(params);
          return this;
        } else
          return condition(this, '_wheres', params, value);
      }

      whereSome(...args) {
        var conditions = (this._whereSomes = this._whereSomes || []);
        conditions.push(args);
        return this;
      }

      whereNot(params, value) {
        return condition(this, '_whereNots', params, value);
      }

      fields(/* fields... */) {
        var _fields = this._fields = this._fields || {};
        for(var i = 0; i < arguments.length; ++i) {
          _fields[arguments[i]] = true;
        }
        return this;
      }

      sort(/* fields... */) {
        var _sort = this._sort = this._sort || {};
        for(var i = 0; i < arguments.length; ++i) {
          var val = arguments[i];
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
      var conditions = (query[map] = query[map] || {});
      if (typeof params === 'string')
        conditions[params] = value;
      else
        util.extend(conditions, params);
      return query;
    }

    function buildList(query, listName, field, values) {
      var items = query[listName] || (query[listName] = {});
      var list = items[field] || (items[field] = []);

      if (Array.isArray(values)) values.forEach(value => list.push(value));
      else list.push(values);

      return query;
    }

    QueryEnv(Query);

    return Query;
  }

  exports = Constructor(require('../env!./query'));
  exports.__init__ = Constructor;

  return exports;
});
