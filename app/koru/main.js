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

    if (typeof onunload === 'function')
      onunload(id, error);

    delete loaded[id];
    requirejs.undef(id);
  }

  function onunload(module, func) {
    var id = typeof module === 'string' ? module : module.id;
    if (id in unloads) {
      var oldFunc = unloads[id];
      unloads[id] = unloadTwo(oldFunc, func);
    } else
      unloads[id] = func;
  }

  function unloadTwo(f1, f2) {
    return function () {
      f1();
      f2();
    };
  }

  function reload() {
    if (loadError) throw loadError;
    console.log('=> Reloading');

    if (isServer) {
      requirejs.nodeRequire('kexec')(process.execPath, process.execArgv.concat(process.argv.slice(1)));
    } else {
      window.location.reload(true);
      throw "reloading"; // no point continuing
    }
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

    if (isClient) {
      var discardIncompleteLoads = function (error) {
        var list = document.head.querySelectorAll('script[data-requiremodule]');
        var badIds = [];
        loadError = error;
        try {
          for(var i = 0; i < list.length; ++i) {
            var elm = list[i];
            var modId = elm.getAttribute('data-requiremodule');
            if (modId && ! loaded.hasOwnProperty(modId)) {
              unload(modId, error);
              badIds.push("\tat "+modId+".js:1");
            }
          }
        } finally {
          loadError = null;
        }
        return badIds;
      };
    } else {
      var discardIncompleteLoads = function () {
        return []; // FIXME what should I do on sever side?
      };
    }

    var koru = (isServer ? global : window)._koru_ = {
      onunload: onunload,
      unload: unload,
      reload: reload,
      providerMap: providerMap,
      unloads: unloads,
      insertDependency: insertDependency,
      loaded: loaded,
      discardIncompleteLoads: discardIncompleteLoads,

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

      setTimeout: function (func, duration) {
        var fiber = util.Fiber(wrapFunc(func));
        return setTimeout(fiber.run.bind(fiber), duration);
      },

      clearTimeout: function (handle) {
        return clearTimeout(handle);
      },

      "\x64ebug": function () {
        koru.logger('\x44EBUG', Array.prototype.slice.call(arguments, 0));
      },

      info: function () {
        koru.logger('INFO', Array.prototype.join.call(arguments, ' '));
      },

      error: function () {
        koru.logger('ERROR', Array.prototype.join.call(arguments, ' '));
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

    if (isServer) {
      koru.appDir = module.config().appDir || require.toUrl('').slice(0,-1);
      koru.libDir = requirejs.nodeRequire('path').resolve(require.toUrl('.'), '../../..');
    } else {
      koru.appDir = require.toUrl('').slice(0,-1);

      koru.afTimeout = function (func, duration) {
        var af = null;
        if (duration && duration > 0)
          var timeout = window.setTimeout(inner, duration);
        else
          inner();

        function inner() {
          timeout = null;
          af = window.requestAnimationFrame(function () {
            af = null;
            wrapFunc(func)();
          });
        }

        return function () {
          if (timeout) window.clearTimeout(timeout);
          if (af) window.cancelAnimationFrame(af);
          af = timeout = null;
        };
      };
    }

    function wrapFunc(func) {
      return function () {
        try {
          func();
        } catch(ex) {
          koru.error(util.extractError(ex));
        }
      };
    }

    return koru;
  });
})();
