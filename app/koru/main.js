(function() {
  /**
   * Map of module dependencies. Entries list what to unload when
   * module unloaded. key is module.id.
   */
  var providerMap = {};
  /**
   * Functions to call when module is unloaded
   */
  var unloads = {};
  var loaded = {};
  var waitLoad = {};
  var koru;

  /**
   * Main koru module. Responsible for:
   *
   *   Fibers
   *   Logging
   *   Dependency tracking and load/unload manager
   *   AppDir location
   */
  define(function (require, exports, module) {
    var util = require('./util');
    var errors = require('./errors');

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

    koru = {
      onunload: onunload,

      unload: function (id) {
        var mod = module.ctx.modules[id];
        mod && mod.unload();
      },

      config: module.config(),
      throwConfigMissing: function (name) {
        throw new Error(module.id + ' config is missing for: ' + name);
      },

      throwConfigError: function (name, reason) {
        throw new Error(module.id + ' config for ' + name + ' is mis-configured: ' + reason);
      },

      Error: errors.Error.bind(errors),
      Fiber: util.Fiber,
      util: util,

      absId: function (require, id) {
        return require.module.normalizeId(id);
      },

      clearTimeout: function (handle) {
        return clearTimeout(handle);
      },

      "\x64ebug": logDebug,

      info: function () {
        koru.logger('INFO', Array.prototype.join.call(arguments, ' '));
      },

      error: function () {
        koru.logger('ERROR', Array.prototype.join.call(arguments, ' '));
      },

      unhandledException: function (ex) {
        koru.error(util.extractError(ex));
      },

      logger: function () {
        var args = util.slice(arguments);
        args.unshift(new Date().toISOString());

        console.log.apply(console, args);
      },

      globalCallback: function (err, result) {
        if (err) koru.error(err);
      },

      userId: function () {
        return util.thread.userId;
      },

      getLocation: function () {
        return window.location;
      },

      getHashOrigin: function () {
        var l = this.getLocation();
        return l.protocol+'//'+l.host+l.pathname;
      },

      nullFunc: function () {},

      /**
       * Converts path to related build path of compiled resource.
       * @param {string} path source path of resource.
       *
       * @returns build path for resource.
       */
      buildPath: function (path) {
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
      var args = util.slice(arguments, 0);
      args.unshift('\x44EBUG');
      koru.logger.apply(koru, args);
    }

    logDebug.inspect = function () {
      koru.logger('\x44EBUG ' + util.map(arguments, function (arg) {return util.inspect(arg)}).join(', '));
    };

    return koru;
  });
})();
