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
      var id = value[idField];
      map[id] = weak(value, function () {delete map[id]});
      return this;
    };

    this.clear = function () {
      util.isObjEmpty(map) || (map = {});
      return this;
    };

    this.delete = function deleteValue(value) {
      delete map[value[idField] || value];
    };
  }

  return WeakIdMap;
});
