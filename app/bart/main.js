var files = {};

requirejs.onResourceLoad = function (context, map, depArray) {
  files[map.name] = depArray;
};

define(function (require, exports, module) {
  var session = require('bart-session');

  exports.files = files;
});
