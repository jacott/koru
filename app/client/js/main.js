requirejs.config({
  //By default load any module IDs from js/lib
  baseUrl: 'js',
  //except, if the module ID starts with "app",
  //load it from the js/app directory. paths
  //config is relative to the baseUrl, and
  //never includes a ".js" extension since
  //the paths config could be for a directory.
  paths: {
    "package": '../package',
  }

});

define(function (require, exports, module) {
  console.log('DEBUG here def');

  var sess = require('package/session');
  var bart = require('package/bart');

  return {};
});
