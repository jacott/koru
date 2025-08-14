define((require, exports, module) => {
  'use strict';
  const KoruError       = require('koru/koru-error');
  const util            = require('./util');

  const reload = (mod) => {
    console.log(`Unloading ${mod.id}`);
    koru.reload();
  };

  const onunload = (moduleOrId, callback) => {
    if (callback === 'reload') {
      callback = reload;
    }
    const subm = typeof moduleOrId === 'string'
      ? module.ctx.modules[moduleOrId]
      : moduleOrId;
    if (subm == null) {
      throw new Error('module not found! ' + moduleOrId);
    }
    subm.onUnload(callback);
  };

  const fetchDependants = (mod, result={}) => {
    if (mod !== undefined && result[mod.id] === undefined) {
      result[mod.id] = true;
      const {modules} = mod.ctx;
      for (let id in mod._requiredBy) fetchDependants(modules[id], result);
    }
    return result;
  };

  const logDebug = (...args) => {
    koru.logger('D', ...args);
    return args.length == 0 ? undefined : args[args.length - 1];
  };

  logDebug.inspect = (...args) => {
    koru.logger('D', args.map((o) => util.inspect(o, 10)).join(', '));
  };

  const Module = module.constructor;

  const koru = {
    onunload,

    PROTOCOL_VERSION: 6,

    unload: (id) => {
      const mod = module.ctx.modules[id];
      if (mod !== undefined && mod.state === Module.READY) {
        mod.unload();
      }
    },

    config: module.config(),

    setTimeout: (func, duration) => {
      if (duration > 2147483640) throw new Error('duration too big');
      return setTimeout(() => {koru.runFiber(func)}, duration);
    },

    throwConfigMissing: (name) => {
      throw new Error(module.id + ' config is missing for: ' + name);
    },

    throwConfigError: (name, reason) => {
      throw new Error(module.id + ' config for ' + name + ' is mis-configured: ' + reason);
    },

    Error: KoruError,
    util,

    absId: (require, id) => require.module.normalizeId(id),

    clearTimeout: (handle) => clearTimeout(handle),

    ['de' + 'bug']: logDebug,

    info: (...args) => {koru.logger('I', args.join(' '))},

    error: (...args) => {koru.logger('E', args.join(' '))},

    unhandledException: (ex) => {koru.error(util.extractError(ex))},

    logger: (...args) => {console.log(...args)},

    globalCallback: (err, result) => {
      if (err) {
        koru.globalErrorCatch === undefined ? koru.error(err) : koru.globalErrorCatch(err);
      }
    },

    userId: () => util.thread.userId,

    getHashOrigin: () => {
      const l = koru.getLocation();
      return l.protocol + '//' + l.host + l.pathname;
    },

    // deprecated use util.voidFunc
    nullFunc: util.voidFunc,

    buildPath: (path) => {
      let idx = path.lastIndexOf('/');
      if (idx === -1) {
        return '.build/' + path;
      }

      return path.slice(0, ++idx) + '.build/' + path.slice(idx);
    },

    fetchDependants,
  };

  // avoid search for de-bug statements
  globalThis['_\x6Boru_'] = koru;
  globalThis['k\x64bg'] = logDebug;

  require('koru/env!./main')(koru);

  /**
   * _wsTimeout is used by session/web-socket-sender-factory; do not override in tests
   **/
  koru._wsTimeout = koru.setTimeout;
  /**
   * _wsClearTimeout is used by session/web-socket-sender-factory; do not override in tests
   **/
  koru._wsClearTimeout = koru.clearTimeout;

  if (module.ctx.onError === undefined) {
    module.ctx.onError = (err, mod) => {
      if (err.onload) {
        const {ctx} = mod;
        const stack = Object.keys(koru.fetchDependants(mod)).map(
          (id) => id === mod.id ? '' : '    at ' + id + '.js:1:1').join('\n');
        koru.error(`ERROR: failed to load module: ${mod.id}
with dependancies:
${stack}`);
      } else {
        const errEvent = err.event;

        if (err.name !== 'SyntaxError' && errEvent && errEvent.filename) {
          const uer = errEvent && errEvent.error || err;
          koru.error(util.extractError({
            toString: () => err.toString(),
            userStack: '    at ' + errEvent.filename + ':' + errEvent.lineno + ':' + errEvent.colno,
          }));
        } else {
          const m = /^([\S]*)([\s\S]*?)    at.*vm(?:.js)?:/.exec(err.stack);
          koru.error(m !== null ? `\n\tat - ${m[1]}\n${m[2]}` : util.extractError(err));
        }
      }
    };
  }
  return koru;
});
