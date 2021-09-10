const path = require('path');
const appDir = path.resolve(__dirname, '../app');

const {KORU_DB, KORU_PORT} = process.env;

exports.common = (cfg) => {
  cfg.merge('requirejs.packages', [
    'koru/model', 'koru/user-account', 'koru/server-pages',
  ]);
  cfg.set('requirejs.enforceAcyclic', true);
};

exports.client = (cfg) => {};

exports.server = (cfg) => {
  cfg.set('requirejs.baseUrl', appDir);
  cfg.set('requirejs.nodeRequire', require);

  cfg.merge('requirejs.config', {
    'koru/config': {
      DBDriver: 'koru/pg/driver',
    },
    'koru/pg/driver': {
      url: `host=/var/run/postgresql dbname=${KORU_DB}`,
      // auto build database schema from models
      // autoSchema: false, // true not recommended
    },
    'koru/web-server': {
      port: KORU_PORT,
    },
  });
};
