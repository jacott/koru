define(function(require, exports, module) {
  const util = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.thread = {dbId: ''};
  util.Fiber = func => ({run: func});

  return util;
});
