var Path = requirejs.nodeRequire('path');

define(function (require, exports, module) {
  var koru = require('./main');
  var WebServerFactory = require('./web-server-factory');

  var root = module.toUrl('');
  var koruParent = Path.join(koru.libDir, 'app');

  var SPECIALS = {
    "index.js": indexjs,
    "require.js": indexjs,

    koru: function (m) {
      return [m[0], koruParent];
    },
  };

  function indexjs() {
    return [koru.config.indexjs || requirejs.nodeRequire.resolve('yaajs/yaa.js'), '/'];
  }

  var DEFAULT_PAGE = module.config().defaultPage || '/index.html';

  var port = module.config().port || 3000;
  var host = module.config().host;

  return WebServerFactory(host, port, root, DEFAULT_PAGE, SPECIALS);
});
