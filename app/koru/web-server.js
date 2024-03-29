define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const asyncTransform = require('koru/async-transform');
  const WebServerFactory = require('koru/web-server-factory');

  const Path = requirejs.nodeRequire('path');

  const root = module.toUrl('');
  const koruParent = Path.join(koru.libDir, 'app');

  const config = module.config();

  const DEFAULT_PAGE = config.defaultPage ?? '/index.html';

  const port = config.port ?? 3000;
  const host = config.host;

  const indexjs = () => [config.indexjs ?? requirejs.ensureClientLoader(), '/'];

  const SPECIALS = {
    'index.html': config.indexhtml && [config.indexhtml, '/'],
    'index.js': indexjs,
    'index.js.map': config.indexjsmap && [config.indexjsmap, '/'],
    'require.js': indexjs,
    'index.css': config.indexcss && [config.indexcss, '/'],
    koru: (m) => [m[0], koruParent],
    ...config.extras,
  };

  return WebServerFactory(host, port, root, DEFAULT_PAGE, SPECIALS, asyncTransform);
});
