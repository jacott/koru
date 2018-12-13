const path = require('path');
const appDir = path.resolve(__dirname, '../app');
const {env} = process;

const port = env.KORU_PORT || 3000;

exports.server = cfg =>{
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
      port,
    },

    "koru/main": {
      "urlRoot": `http://localhost:${port}/`,
      appDir: appDir,
    },
  });

  cfg.merge('extraRequires', [
    'koru/css/less-watcher', 'koru/server-rc',
  ]);
};

exports.client = cfg =>{
  cfg.merge('requirejs.config.client.extraRequires', [
    'demo-client',
  ]);
};
