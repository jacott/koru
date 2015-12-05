var path = require('path');
var appDir = path.resolve(__dirname, '../app');

exports.server = function (cfg) {
  cfg.merge('requirejs', {
    baseUrl: appDir,

    config: {
      "koru/config": {
        DBDriver: "koru/"+(process.env['KORUTEST_DBDRIVER'] || "pg")+"/driver",
      },
      "koru/mongo/driver": {url: "mongodb://localhost:"+process.env['MONGO_PORT']+"/koru"},
      "koru/pg/driver": {
        url: "host=/var/run/postgresql dbname=korutest",
        autoSchema: true,
      },

      "koru/web-server": {
        port: 3000,
        defaultPage: 'test/index.html',
      },
    },
  });

  cfg.merge("requirejs.paths", {sinon: "koru/test/sinon"});
  cfg.merge("requirejs.packages", ["koru/test"]);
  cfg.merge("requirejs.shim", {sinon: {}});

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};
