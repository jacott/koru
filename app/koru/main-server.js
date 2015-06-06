global.isServer = true;
global.isClient = false;

define(function(require, exports, module) {
  var util = require('./util-server');
  var koru = global._koru_ = require('./main');

  koru.discardIncompleteLoads = function () {
    return []; // FIXME what should I do on sever side?
  };

  koru.reload = function () {
    if (koru.loadError) throw koru.loadError;
    console.log('=> Reloading');

    requirejs.nodeRequire('kexec')(process.execPath, process.execArgv.concat(process.argv.slice(1)));
  };

  koru.appDir = koru.config.appDir || require.toUrl('').slice(0,-1);
  koru.libDir = requirejs.nodeRequire('path').resolve(require.toUrl('.'), '../../..');

  koru.setTimeout = function (func, duration) {
    var fiber = util.Fiber(function () {
      try {
        func();
      } catch(ex) {
        koru.error(util.extractError(ex));
      }
    });
    return setTimeout(fiber.run.bind(fiber), duration);
  };

  return koru;
});
