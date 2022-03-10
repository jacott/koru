global.isServer = true;
global.isClient = false;
global.isTest = false;

Error.stackTraceLimit = 50;

const requirejs = global.requirejs = require('yaajs');
const cfg = require('./build-conf')(process.env.KORU_ENV);

requirejs.nodeRequire = require;

const ctx = requirejs.module.ctx;
ctx.constructor.setGlobalName('requirejs');
ctx.config(cfg.server.requirejs);

module.exports = (deps, func) => {
  globalThis.__koruThreadLocal.run({}, () => requirejs(deps, async (...args) => {
    try {
      await func(...args);
    } catch (ex) {
      console.error(ex);
      process.exit(1);
    }
  }));
};
