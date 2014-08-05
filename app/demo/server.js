var requirejs = require('requirejs');

var koruPath = '../koru';

var config = require('./demo-config.js');

var mainConfig = config['koru/main'];

requirejs.config({
  //Use node's special variable __dirname to
  //get the directory containing this file.
  //Useful if building a library that will
  //be used in node but does not require the
  //use of node outside
  baseUrl: __dirname,
  config: config,

  packages: [
    "koru", "koru/model", "koru/session", "koru/user-account",
  ],

  paths: {
    koru: koruPath,
  },

  //Pass the top-level main.js/index.js require
  //function to requirejs so that node modules
  //are loaded relative to the top-level JS file.
  nodeRequire: require
});

requirejs(['koru', 'bootstrap', 'publish-all', 'koru/server', 'koru/session'], function (koru, bootstrap) {
  koru.Fiber(function () {
    bootstrap();

    requirejs(mainConfig.extraRequires || [], function (startup) {
      koru.Fiber(function () {

        console.log('=> Ready');
      }).run();
    });
  }).run();
});
