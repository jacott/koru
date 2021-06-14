const path = require('path');
const appDir = path.resolve(__dirname, '../app');
const {KORU_PORT, KORUAPI} = process.env;

exports.server = cfg =>{
  cfg.set('requirejs.baseUrl', appDir);
  cfg.merge('requirejs.config', {
    "koru/web-server": {
      defaultPage: 'test/index.html',
    },

    "koru/test/build-cmd": {excludeDirs: ['koru']}
  });

  cfg.merge('extraRequires', [
    'koru/css/less-watcher', // auto compile less files
    'koru/server-rc',        // enable remote control via websocket
  ]);

  cfg.merge("requirejs.packages", ["koru/test"]);

  cfg.set('startup', 'test/server');
  cfg.set('clientjs', 'test/client');
};

exports.common = cfg =>{
  // Auto api compiling when tests are run is controlled by env.KORUAPI
  const record = !! KORUAPI;
  cfg.set('requirejs.config.koru/test/api.record', record);
};

exports.client = cfg =>{
  cfg.merge('requirejs.packages', ["koru/test"]);
};
