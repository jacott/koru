var weak = requirejs.nodeRequire('weak');

define(function(require, exports, module) {
  var util = require('koru/util');

  function WeakIdMap(idField) {
    idField = idField || '_id';
    var map = {};

    this.get = function (key) {
      var ref = map[key];
      return ref && weak.get(ref);
    };

    this.set = function (value) {
      map[value[idField]] = weak(value, deleteValue);
      return this;
    };

    this.clear = function () {
      util.isObjEmpty(map) || (map = {});
      return this;
    };

    this.delete = deleteValue;

    function deleteValue(value) {
      delete map[value[idField] || value];
    }
  }

  return WeakIdMap;
});
