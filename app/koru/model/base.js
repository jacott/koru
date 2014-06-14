define(function(require, exports, module) {
  var util = require('koru/util');

  function BaseModel(attributes, changes) {
    if(attributes.hasOwnProperty('_id')) {
      // existing record
      this.attributes = attributes;
      this.changes = changes || {};
    } else {
      // new record
      this.attributes = {};
      this.changes = attributes;
      util.extend(this.changes, this.constructor._defaults);
    }
  }

  return BaseModel;
});
