const path = require('path');
const appDir = path.resolve(__dirname, '../app');

const {KORU_DB, KORU_PORT, KORUAPI, KORUTEST_DBDRIVER="pg"} = process.env;

exports.server = cfg => {
  cfg.set('requirejs.baseUrl', appDir);
  cfg.merge('requirejs.config', {
    "koru/config": {
      DBDriver: `koru/${KORUTEST_DBDRIVER}/driver`,
    },
    "koru/pg/driver": {
      url: `host=/var/run/postgresql dbname=${KORU_DB} options='-c client_min_messages=ERROR'`,
      autoSchema: true,
    },

    "koru/web-server": {
      port: KORU_PORT,
      defaultPage: 'test/index.html',
    },
  });

  cfg.merge("requirejs.packages", ["koru/test"]);

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};

exports.common = cfg => {
  const record = !! KORUAPI;
  cfg.set('requirejs.recordExports', record);
  cfg.set('requirejs.config.koru/test/api.record', record);
};

exports.client = cfg => {
  cfg.merge('requirejs.packages', ["koru/test"]);
};
