const path = require('path');
const appDir = path.resolve(__dirname, '../app');

exports.server = cfg => {
  cfg.set('requirejs.baseUrl', appDir);
  cfg.merge('requirejs.config', {
    "koru/config": {
      DBDriver: "koru/"+(process.env['KORUTEST_DBDRIVER'] || "pg")+"/driver",
    },
    "koru/pg/driver": {
      url: "host=/var/run/postgresql dbname=korutest",
      autoSchema: true,
    },

    "koru/web-server": {
      port: 3000,
      defaultPage: 'test/index.html',
    },
  });

  cfg.merge("requirejs.packages", ["koru/test"]);

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};

exports.common = cfg => {
  const record = !! process.env.KORUAPI;
  cfg.set('requirejs.recordExports', record);
  cfg.set('requirejs.config.koru/test/api.record', record);
};

exports.client = cfg => {
  cfg.merge('requirejs.packages', ["koru/test"]);
};
