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

    if (onunload === 'reload') return reload();

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
    unloads[typeof module === 'string' ? module : module.id] = func;
  }

  function reload() {
    console.log('=> Reloading');

    if (isServer) {
      requirejs.nodeRequire('kexec')(process.execPath, process.execArgv.concat(process.argv.slice(1)));
    } else {
      window.location.reload();
      throw "reloading"; // no point continuing
    }
  }

  function appDir(require, module) {
    if (isServer)
      return require('path').resolve(module.config().appDir || require.toUrl('').slice(0,-1));

    return require.toUrl('').slice(0,-1);
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
      var discardIncompleteLoads = function () {
        var list = document.head.querySelectorAll('script[data-requiremodule]');
        var badIds = [];
        for(var i = 0; i < list.length; ++i) {
          var elm = list[i];
          var modId = elm.getAttribute('data-requiremodule');
          if (modId && ! loaded.hasOwnProperty(modId)) {
            unload(modId);
            badIds.push("\tat "+modId+".js:1");
          }
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
      appDir: appDir(require, module),

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
        var fiber = util.Fiber(function () {
          try {
            func();
          }
          catch(ex) {
            koru.error(util.extractError(ex));
          }
        });
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
        console.log.apply(console, arguments);
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

    return koru;
  });
})();
