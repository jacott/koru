var path = require('path');
var appDir = path.resolve(__dirname, '../app');

exports.server = function (cfg) {
  cfg.merge('requirejs', {
    baseUrl: appDir,

    config: {
      "koru/config": {
        DBDriver: "koru/pg/driver",
      },
      "koru/mongo/driver": {url: "mongodb://localhost:"+process.env['MONGO_PORT']+"/koru"},
      "koru/pg/driver": {url: "host=/var/run/postgresql dbname=korutest"},
      "koru/web-server": {
        port: 3000,
        defaultPage: 'test/index.html',
      },
    },
  });

  cfg.merge("requirejs.packages", ["koru/test"]);

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};

exports.client = function (cfg) {
  cfg.set('requirejs.baseUrl', '/');
  cfg.set('requirejs.packages', ["koru", "koru/test", "koru/session"]);
}
