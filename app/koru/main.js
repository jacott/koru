(function() {
  // FIXME need this to work diferently in optimiser
  var suffix  = typeof process === 'undefined' ? '-client' : '-server';

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
  var loadError = null;
  var koru;

  function noopFunc(value) {return value}

  requirejs.onResourceLoad = function (context, map, depArray) {
    if (depArray) for(var i = 0; i < depArray.length; ++i) {
      var row = depArray[i];
      var id = row.id;
      if (id === 'require' || id === 'exports' || id === 'module')
        continue;

      // If name is unnormalized then it wont match. So we ask the
      // prefix to normalize it for us if needed.
      if (row.unnormalized) {
        var plugin = require(row.prefix); // plugin will already be loaded
        id = row.prefix+"!"+ (plugin.normalize ? plugin.normalize(row.name, noopFunc) : row.name);
      }
      insertDependency(map.id, id);
    }
    loaded[map.id] = true;
  };

  function insertDependency(dependant, provider) {
    (providerMap[provider] = providerMap[provider] || {})[dependant] = true;
  }

  function unload(id, error) {
    if (! requirejs.defined(id)) return;

    var deps = providerMap[id];

    if (deps === 'unloading') return;

    var onunload = unloads[id];
    delete unloads[id];

    if (! loadError && onunload === 'reload') return reload();

    if (deps) {
      providerMap[id] = 'unloading';
      for(var key in deps) {
        unload(key, error);
      }
      delete providerMap[id];
    }

    if (onunload !== undefined) {
      if (typeof onunload === 'function')
        onunload(id, error);
      else if (onunload !== 'reload')
        onunload.forEach(function (f) {f(id, error)});
    }

    delete loaded[id];
    requirejs.undef(id);
  }

  function revertonunload(module, func) {
    var id = typeof module === 'string' ? module : module.id;

    var oldFunc = unloads[id];
    if (oldFunc === func) {
      delete unloads[id];
    }
    if (Array.isArray(oldFunc)) {
      var i = oldFunc.indexOf(func);
      if (i !== -1)
        oldFunc.splice(i, 1);
      if (oldFunc.length === 0)
        delete unloads[id];
    }
  }

  function onunload(module, func) {
    var id = typeof module === 'string' ? module : module.id;
    var oldFunc = unloads[id];
    if (func === 'reload' || oldFunc === 'reload') {
      unloads[id] = 'reload';
      return;
    }
    var len = arguments.length;
    if (oldFunc === undefined)
      oldFunc = unloads[id] = len > 2 ? [func] : func;
    else if (typeof oldFunc === 'function')
      oldFunc = unloads[id] = [oldFunc, func];
    else
      oldFunc.push(func);

    if (len > 2) for(var i = 0; i < len; ++i) {
      oldFunc.push(arguments[i]);
    }
  }

  function reload() {
    koru.reload();
  }

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

    var loaderPrefix = module.id + "!";

    koru = {
      onunload: onunload,
      revertonunload: revertonunload,
      unload: unload,
      providerMap: providerMap,
      unloads: unloads,
      insertDependency: insertDependency,
      loaded: loaded,
      get loadError() {return loadError},
      set loadError(value) {loadError = value},

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
        id = require.toUrl(id);

        return id.slice(require.toUrl('').length);
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
    };

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
