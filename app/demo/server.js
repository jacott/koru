var Fiber = require('fibers');
var requirejs = require('requirejs');

requirejs.config({
  //Use node's special variable __dirname to
  //get the directory containing this file.
  //Useful if building a library that will
  //be used in node but does not require the
  //use of node outside
  baseUrl: __dirname,

  config: {
    "bart/env": {mode: 'demo'},

    "bart/mongo/driver": {url: "mongodb://localhost:3014/demo"},
  },

  packages: ['bart/model'],

  paths: {
    bart: '../bart',
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

requirejs(['bart/env', 'bootstrap', 'bart/server', 'bart/file-watch', 'bart/server-rc'], function (env, bootstrap) {
  Fiber(function () {
    bootstrap();
    console.log('=> Ready');
  }).run();
});
