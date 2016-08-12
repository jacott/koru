const path = require('path');
const appDir = path.resolve(__dirname, '../app');
const {env} = process;

exports.server = function (cfg) {
  cfg.set('requirejs.baseUrl', appDir);
  cfg.merge('requirejs.config', {
    "koru/config": {
      DBDriver: "koru/pg/driver",
    },
    "koru/pg/driver": {
      url: `host=/var/run/postgresql dbname=${env.KORU_APP_NAME}demo`,

      // auto build database schema from models
      // autoSchema: false,
    },

    "koru/web-server": {
      port: 3000,
    },

    "koru/main": {
      "urlRoot": 'http://localhost:3000/',
      appDir: appDir,
    },
  });

  cfg.merge('extraRequires', [
    'koru/css/less-watcher', 'koru/server-rc',
  ]);
};

exports.client = function (cfg) {
  cfg.merge('requirejs.config.client.extraRequires', [
    'demo-client',
  ]);
};
