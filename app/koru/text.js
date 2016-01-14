define(function(require, exports, module) {
  var util = require('koru/util');
  var loader = require('koru/env!./text');

  return {
    load: function (name, req, onload, config) {
      var mod = req.module;

      loader.load(name, onload);
    },
  };
});
