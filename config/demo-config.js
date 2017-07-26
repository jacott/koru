const path = require('path');
const appDir = path.resolve(__dirname, '../app');

exports.server = function (cfg) {
  cfg.merge('requirejs', {
    baseUrl: path.resolve(appDir, 'demo'),

    config: {
      "koru/config": {
        DBDriver: "koru/pg/driver",
      },
      "koru/pg/driver": {
        url: "host=/var/run/postgresql dbname=korudemo",
        autoSchema: true,
      },

      "koru/web-server": {
        host: "0.0.0.0",
        port: 3000,
        // indexHtml: path.resolve(appDir, 'demo/index.html'),
      },

      "koru/main": {
        "urlRoot": 'http://localhost:3000/',
        appDir: appDir,
      },
    },
  });
};
