const Fiber = require('fibers');

global.isServer = true;
global.isClient = false;

Error.stackTraceLimit = 50;

const requirejs = global.requirejs = require('yaajs');
const cfg = require('./build-conf')(process.env.APP_ENV);

requirejs.nodeRequire = require;

const ctx = requirejs.module.ctx;
ctx.constructor.setGlobalName('requirejs');
ctx.config(cfg.server.requirejs);

module.exports = function (deps, func) {
  Fiber(() => requirejs(deps, function () {
    try {
      func.apply(this, arguments);
    } catch(ex) {
      console.error(ex);
      process.exit(1);
    }
  })).run();
};
