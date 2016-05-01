define(function(require, exports, module) {
  var util = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.thread = {dbId: ''};
  util.Fiber = function(func) {return {run: func}};
  util.withDB = function (dbId, func) {
    var orig = util.dbId;
    if (dbId === orig)
      return func();

    try {
      util.dbId = dbId;
      return func();
    } finally {
      util.dbId = orig;
    }
  };

  return util;
});
