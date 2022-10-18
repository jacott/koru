define((require, exports, module) => {
  'use strict';
  const startup         = require('startup-client');

  require(module.config().extraRequires || [], () => {
    startup.start(module.config().extraRequires);
  });
});
