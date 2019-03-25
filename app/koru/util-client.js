define((require)=>{
  'use strict';
  const util            = require('./util');

  util.engine = util.browserVersion(navigator.userAgent);
  util.isFirefox = util.engine.startsWith('Firefox');
  util.isSafari = util.engine.startsWith('Safari');
  util.thread = {dbId: ''};

  return util;
});
