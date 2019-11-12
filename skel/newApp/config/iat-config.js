const path = require('path');
const appDir = path.resolve(__dirname, '../app');

const KORU_PORT = process.env.KORU_PORT;

const urlRoot = 'http://localhost:'+KORU_PORT;

exports.server = cfg =>{
  cfg.merge('requirejs', {
    config: {
      "koru/web-server": {
        host: "0.0.0.0",
        indexhtml: path.resolve(appDir, '../build/index.html'),
        indexjs: path.resolve(appDir, '../build/index.js'),
        indexcss: path.resolve(appDir, '../build/index.css'),
      },

      "koru/main": {
        urlRoot,
        "userAccount" : {
          emailConfig: {
            siteName: 'Chat Sample App',
          },
        },
      },
    },
  });

  // cfg.merge('extraRequires', [
  //   'iat-server',
  // ]);
};

exports.client = cfg =>{
  // cfg.merge('requirejs.config.client.extraRequires', [
  //   'iat-client',
  // ]);
};
