var Fiber = require('fibers');
var Path = require('path');
var requirejs = require('requirejs');

requirejs.config({
  //Use node's special variable __dirname to
  //get the directory containing this file.
  //Useful if building a library that will
  //be used in node but does not require the
  //use of node outside
  baseUrl: __dirname,

  config: {
    "koru": {appDir: Path.resolve(__dirname + '/..')},

    "koru/mongo/driver": {url: "mongodb://localhost:3014/demo"},
  },

  packages: ['koru', 'koru/model'],

  paths: {
    koru: '../koru',
  },

  //Pass the top-level main.js/index.js require
  //function to requirejs so that node modules
  //are loaded relative to the top-level JS file.
  nodeRequire: require
});

// requirejs.onResourceLoad = function (context, map, depArray) {
// }



//Now export a value visible to Node.
module.exports = function () {};

requirejs(['koru', 'bootstrap', 'publish-all', 'koru/server', 'koru/file-watch', 'koru/server-rc'], function (koru, bootstrap) {
  Fiber(function () {
    bootstrap();
    console.log('=> Ready');
  }).run();
});
