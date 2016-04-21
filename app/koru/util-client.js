define(function(require, exports, module) {
  var util = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.thread = {};
  util.Fiber = function(func) {return {run: func}};
  util.withDB = function (db, func) {
    var orig = util.thread.db;
    if (db === orig)
      return func();

    try {
      util.thread.db = db;
      return func();
    } finally {
      util.thread.db = orig;
    }
  };

  return util;
});
