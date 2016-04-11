define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');

  koru.onunload(module, function () {
    exports._unload && exports._unload();
  });

  function Constructor(QueryEnv) {

    function Query(model) {
      this.model = model;
    }

    Query.prototype = {
      constructor: Query,

      onModel: function (model) {
        this.model = model;
        return this;
      },

      onId: function (id) {
        this.singleId = id;
        return this;
      },

      inc: function (field, amount) {
        (this._incs = this._incs || {})[field] = amount || 1;
        return this;
      },

      addItemAnd: function (field, values) {
        return buildList(this, '_addItems', field, values);
      },

      removeItemAnd: function (field, values) {
        return buildList(this, '_removeItems', field, values);
      },

      addItem: function (field, values) {
        return this.addItemAnd(field, values).update();
      },

      removeItem: function (field, values) {
        return this.removeItemAnd(field, values).update();
      },

      where: function (params, value) {
        if (typeof params === 'function') {
          var funcs = this._whereFuncs || (this._whereFuncs = []);
          funcs.push(params);
          return this;
        } else
          return condition(this, '_wheres', params, value);
      },

      whereSome: function (...args) {
        var conditions = (this._whereSomes = this._whereSomes || []);
        conditions.push(args);
        return this;
      },

      whereNot: function (params, value) {
        return condition(this, '_whereNots', params, value);
      },

      fields: function (/* fields... */) {
        var _fields = this._fields = this._fields || {};
        for(var i = 0; i < arguments.length; ++i) {
          _fields[arguments[i]] = true;
        }
        return this;
      },

      sort: function (/* fields... */) {
        var _sort = this._sort = this._sort || {};
        for(var i = 0; i < arguments.length; ++i) {
          var val = arguments[i];
          if (typeof val === 'string')
            _sort[val] = 1;
          else
            _sort[arguments[i-1]] = val;
        }
        return this;
      },

      fetchField: function(field) {
        this.fields(field);

        return this.map(function (doc) {
          return doc[field];
        });
      },

      fetchIds: function() {
        return this.fetchField('_id');
      },
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

      if (Array.isArray(values)) values.forEach(function (value) {
        list.push(value);
      });
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
