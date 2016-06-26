/**
 * Main koru module. Responsible for:
 *
 *   Fibers
 *   Logging
 *   Dependency tracking and load/unload manager
 *   AppDir location
 */
define(function (require, exports, module) {
  const errors = require('./errors');
  const util   = require('./util');

  /**
   * Map of module dependencies. Entries list what to unload when
   * module unloaded. key is module.id.
   */
  const providerMap = {};
  /**
   * Functions to call when module is unloaded
   */
  const unloads = {};
  const loaded = {};
  const waitLoad = {};
  function reload() {
    return koru.reload();
  }

  function onunload(subm, func) {
    if (func === 'reload')
      func = reload;
    if (typeof subm === 'string')
      subm = module.ctx.modules[subm];

    subm && subm.onUnload(typeof func === 'function' ? func : func.stop);
  }

  const koru = {
    onunload,

    unload (id) {
      var mod = module.ctx.modules[id];
      mod && mod.unload();
    },

    config: module.config(),

    throwConfigMissing (name) {
      throw new Error(module.id + ' config is missing for: ' + name);
    },

    throwConfigError (name, reason) {
      throw new Error(module.id + ' config for ' + name + ' is mis-configured: ' + reason);
    },

    replaceProperty (object, prop, newValue) {
      var oldValue = Object.getOwnPropertyDescriptor(object, prop);
      if (! oldValue) {
        newValue.writeable === undefined && (newValue.writeable = true);
        newValue.enumerable === undefined && (newValue.enumerable = true);
        newValue.configurable === undefined && (newValue.configurable = true);
      }
      Object.defineProperty(object, prop, newValue);
      return oldValue;
    },

    Error: errors.Error.bind(errors),
    util,

    absId (require, id) {
      return require.module.normalizeId(id);
    },

    clearTimeout (handle) {
      return clearTimeout(handle);
    },

    "\x64ebug": logDebug,

    info () {
      koru.logger('INFO', Array.prototype.join.call(arguments, ' '));
    },

    error () {
      koru.logger('ERROR', Array.prototype.join.call(arguments, ' '));
    },

    unhandledException (ex) {
      koru.error(util.extractError(ex));
    },

    logger () {
      var args = new Array(arguments.length + 1);
      args[0] = new Date().toISOString();
      for(var i = 1; i < args.length; ++i) args[i] = arguments[i-1];

      console.log.apply(console, args);
    },

    globalCallback (err, result) {
      if (err) koru.error(err);
    },

    userId () {
      return util.thread.userId;
    },

    getHashOrigin: function () {
      var l = this.getLocation();
      return l.protocol+'//'+l.host+l.pathname;
    },

    nullFunc () {},

    /**
     * Converts path to related build path of compiled resource.
     * @param {string} path source path of resource.
     *
     * @returns build path for resource.
     */
    buildPath (path) {
      var idx = path.lastIndexOf('/');
      if (idx === -1)
        return '.build/' + path;

      return path.slice(0, ++idx) + '.build/' + path.slice(idx);
    },

    fetchDependants: fetchDependants,
  };

  function fetchDependants(mod, result) {
    if (! result) result = {};
    if (! mod || result[mod.id]) return result;
    result[mod.id] = true;
    var modules = mod.ctx.modules;
    var deps = mod.dependants;
    for (var id in deps) {
      var map = {};
      fetchDependants(modules[id], result);
    }
    return result;
  }

  function logDebug() {
    var args = new Array(arguments.length + 1);
    args[0] = '\x44EBUG';
    for(var i = 1; i < args.length; ++i) args[i] = arguments[i-1];

    koru.logger.apply(koru, args);
  }

  logDebug.inspect = function () {
    var args = new Array(arguments.length);
    for(var i = 0; i < arguments.length; ++i)
      args[i] = util.inspect(arguments[i]);

    koru.logger('\x44EBUG ', args.join(', '));
  };

  return koru;
});
