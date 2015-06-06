define(function(require, exports, module) {
  var util = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.thread = {};
  util.Fiber = function(func) {return {run: func}};

  return util;
});
