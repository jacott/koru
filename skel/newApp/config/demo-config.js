const path = require('path');
const appDir = path.resolve(__dirname, '../app');
const {KORU_PORT, KORU_APP_NAME} = process.env;

exports.server = (cfg) => {
  cfg.set('requirejs.baseUrl', appDir);
  cfg.merge('requirejs.config', {
    'koru/main': {
      'urlRoot': `http://localhost:${KORU_PORT}/`,
      appDir,
    },
  });

  cfg.merge('extraRequires', [
    'koru/css/less-watcher', 'koru/server-rc',
  ]);
};

exports.client = (cfg) => {
  cfg.merge('requirejs.config.client.extraRequires', [
    'demo-client',
  ]);
};
