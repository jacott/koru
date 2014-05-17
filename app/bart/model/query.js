define(function(require, exports, module) {
  var util = require('../util');
  var env = require('../env!./query'); // client-main or server-main

  function Query(model) {
    this.model = model;
  }

  Query.prototype = {
    constructor: Query,

    on: function (id) {
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
  };

  env.init(Query);

  return Query;
});
