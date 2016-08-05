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
      url: `host=/var/run/postgresql dbname=${env.KORU_APP_NAME}test`,

      // auto build database schema from models
      autoSchema: true,
    },

    "koru/web-server": {
      port: 3000,
      defaultPage: 'test/index.html',
    },
  });

  cfg.merge('extraRequires', [
    'koru/css/less-watcher', // auto compile less files
    'koru/server-rc',        // enable remote control via websocket
  ]);

  cfg.merge("requirejs.packages", ["koru/test"]);

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};

exports.common = function (cfg) {
  // Auto api compiling when tests are run is controlled by env.KORUAPI
  const record = !! env.KORUAPI;
  cfg.set('requirejs.recordExports', record);
  cfg.set('requirejs.config.koru/test/api.record', record);
};

exports.client = function (cfg) {
  cfg.merge('requirejs.packages', ["koru/test"]);
};
