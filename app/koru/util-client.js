define((require)=>{
  const util = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.thread = {dbId: ''};

  return util;
});
