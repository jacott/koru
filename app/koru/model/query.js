define(function(require, exports, module) {
  var util = require('../util');
  var env = require('../env!./query'); // client-main or server-main

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
      (this._incs = this._incs || {})[field] = amount;
      return this;
    },

    where: function (conditions) {
      util.extend((this._conditions = this._conditions || {}), conditions);
      return this;
    },

    fields: function (/* fields... */) {
      var _fields = this._fields = this._fields || {};
      for(var i = 0; i < arguments.length; ++i) {
        _fields[arguments[i]] = true;
      }
      return this;
    },

    findField: function(field) {
      this.fields(field);

      return this.map(function (doc) {
        return doc[field];
      });
    },

    findIds: function() {
      return this.findField('_id');
    },
  };

  env.init(Query);

  return Query;
});
