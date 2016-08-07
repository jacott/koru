define(function (require, exports, module) {
  const koru             = require('koru');
  const WebServerFactory = require('koru/web-server-factory');
  const Path             = requirejs.nodeRequire('path');

  const root = module.toUrl('');
  const koruParent = Path.join(koru.libDir, 'app');

  const DEFAULT_PAGE = module.config().defaultPage || '/index.html';

  const port = module.config().port || 3000;
  const host = module.config().host;

  const SPECIALS = {
    "index.js": indexjs,
    "require.js": indexjs,

    koru(m) {
      return [m[0], koruParent];
    },
  };

  function indexjs() {
    return [koru.config.indexjs || requirejs.nodeRequire.resolve('yaajs/yaa.js'), '/'];
  }


  return WebServerFactory(host, port, root, DEFAULT_PAGE, SPECIALS);
});
