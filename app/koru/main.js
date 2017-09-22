define(function (require, exports, module) {
  const yaajsGraph = require('koru/yaajs-graph');
  const util       = require('./util');

  class KoruError extends Error {
    constructor(error, reason, details) {
      super(typeof reason === 'string' ?
            `${reason} [${error}]` : `${util.inspect(reason)} [${error}]`);
      this.error = error;
      this.reason = reason;
      this.details = details;
    }
  }
  KoruError.name = KoruError.prototype.name = 'KoruError';

  /**
   * Map of module dependencies. Entries list what to unload when
   * module unloaded. key is module.id.
   **/
  const providerMap = {};
  /**
   * Functions to call when module is unloaded
   **/
  const unloads = {};
  const loaded = {};
  const waitLoad = {};
  function reload(mod) {
    console.log(`Unloading ${mod.id}`);
    return koru.reload(mod);
  }

  function onunload(moduleOrId, callback) {
    if (callback === 'reload')
      callback = reload;
    const subm = typeof moduleOrId === 'string' ?
            module.ctx.modules[moduleOrId] : moduleOrId;
    if (! subm)
      throw new Error('module not found! '+ moduleOrId);
    subm.onUnload(typeof callback === 'function' ? callback : callback.stop);
  }

  const koru = {
    onunload,

    PROTOCOL_VERSION: 5,

    unload(id) {
      const mod = module.ctx.modules[id];
      mod && mod.unload();
    },

    config: module.config(),

    throwConfigMissing(name) {
      throw new Error(module.id + ' config is missing for: ' + name);
    },

    throwConfigError(name, reason) {
      throw new Error(module.id + ' config for ' + name + ' is mis-configured: ' + reason);
    },

    replaceProperty(object, prop, newValue) {
      const oldValue = Object.getOwnPropertyDescriptor(object, prop);
      if (! oldValue) {
        newValue.writeable === undefined && (newValue.writeable = true);
        newValue.enumerable === undefined && (newValue.enumerable = true);
        newValue.configurable === undefined && (newValue.configurable = true);
      }
      Object.defineProperty(object, prop, newValue);
      return oldValue;
    },

    Error: KoruError,
    util,

    absId(require, id) {
      return require.module.normalizeId(id);
    },

    clearTimeout(handle) {
      return clearTimeout(handle);
    },

    "\x64ebug": logDebug,

    info(...args) {
      koru.logger('INFO', args.join(' '));
    },

    error(...args) {
      koru.logger('ERROR', args.join(' '));
    },

    unhandledException(ex) {
      koru.error(util.extractError(ex));
    },

    logger(...args) {
      console.log(...args);
    },

    globalCallback(err, result) {
      if (err)
        koru.globalErrorCatch ? koru.globalErrorCatch(err) : koru.error(err);
    },

    userId() {
      return util.thread.userId;
    },

    getHashOrigin() {
      const l = this.getLocation();
      return l.protocol+'//'+l.host+l.pathname;
    },

    nullFunc() {},

    /**
     * Converts path to related build path of compiled resource.
     * @param {string} path source path of resource.
     *
     * @returns build path for resource.
     */
    buildPath(path) {
      let idx = path.lastIndexOf('/');
      if (idx === -1)
        return '.build/' + path;

      return path.slice(0, ++idx) + '.build/' + path.slice(idx);
    },

    fetchDependants: fetchDependants,

    findPath: yaajsGraph.findPath,
    isRequiredBy: yaajsGraph.isRequiredBy,
  };

  function fetchDependants(mod, result) {
    if (! result) result = {};
    if (! mod || result[mod.id]) return result;
    result[mod.id] = true;
    const modules = mod.ctx.modules;
    const deps = mod._requiredBy;
    for (let id in deps) {
      const map = {};
      fetchDependants(modules[id], result);
    }
    return result;
  }

  function logDebug(...args) {
    const nargs = new Array(args.length + 1);
    nargs[0] = '\x44EBUG';
    for(let i = 0; i < args.length; ++i) nargs[i+1] = args[i];

    koru.logger.apply(koru, nargs);
  }

  logDebug.inspect = function (...args) {
    for(let i = 0; i < args.length; ++i)
      args[i] = util.inspect(args[i]);

    koru.logger('\x44EBUG ', args.join(', '));
  };

  require('koru/env!./main')(koru);

  return koru;
});
