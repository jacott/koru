const path = require('path');
const appDir = path.resolve(__dirname, '../app');

exports.common = cfg =>{
  cfg.merge('requirejs.packages', [
    "koru/model", "koru/user-account", "koru/server-pages",
  ]);
  cfg.set('requirejs.enforceAcyclic', true);
};

exports.client = cfg =>{};

exports.server = cfg =>{
  cfg.set('requirejs.baseUrl', appDir);
  cfg.set('requirejs.nodeRequire', require);
};
