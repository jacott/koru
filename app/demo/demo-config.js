module.exports = {
  "koru/mongo/driver": {url: "mongodb://localhost:3014/demo"},

  "koru/web-server": {
    host: "0.0.0.0",
    port: 3000,
    requirejs: '../node_modules/requirejs',
  },

  "koru/main": {
    "urlRoot": 'http://localhost:3000/',
    appDir: '.',
    "userAccount" : {
      emailConfig: {
        from: 'obeya-demo@obeya.co',
        siteName: 'Obeya demo',
      },
    },
    extraRequires: [
      'koru/css/less-watcher', 'koru/server-rc',
    ],

    startUp: function (requirejs, koruPath) {
      requirejs(['koru/file-watch'], function (fileWatch) {
        var file = __dirname + '/' + koruPath;
        fileWatch.watch(file, file.replace(/\/koru$/, ''));
      });
    }
  },
};
