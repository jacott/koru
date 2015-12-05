global.isServer = true;
global.isClient = false;

define(function(require, exports, module) {
  var util = require('./util-server');
  var koru = global._koru_ = require('./main');

  koru.reload = function () {
    if (koru.loadError) throw koru.loadError;
    console.log('=> Reloading');

    var argv = process.argv.slice(0,1).concat(process.execArgv.concat(process.argv.slice(1)));
    requirejs.nodeRequire('bindings')('koru_restart.node')
      .execv(process.execPath, argv);
  };


  koru.appDir = koru.config.appDir || module.toUrl('').slice(0,-1);
  koru.libDir = requirejs.nodeRequire('path').resolve(module.toUrl('.'), '../../..');

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

  module.ctx.onError = function (error, mod) {
    koru.error("error loading: " + mod.id + '\nwith dependancies:\n' + JSON.stringify(koru.fetchDependants(mod)));
    throw error;
  };

  return koru;
});
