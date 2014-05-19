(function() {
  // FIXME need this to work diferently in optimiser
  var prefix  = typeof process === 'undefined' ? 'client-' : 'server-';

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

  requirejs.onResourceLoad = function (context, map, depArray) {
    if (depArray) for(var i = 0; i < depArray.length; ++i) {
      var row = depArray[i];
      var id = row.id;
      if (id === 'require' || id === 'exports' || id === 'module')
        continue;

      // If name is unnormalized then it wont match. We could try and
      // ask the prefix to normalize it for us but that is not a
      // normal plugin function. For now we'll just trust the
      // (maybe) semi-unnormalized name.
      if (row.unnormalized) id = row.prefix+"!"+row.name;

      insertDependency(map.id, id);
    }
    loaded[map.id] = true;
  };

  function insertDependency(dependant, provider) {
    (providerMap[provider] = providerMap[provider] || {})[dependant] = true;
  }

  function unload(id) {
    if (! requirejs.defined(id)) return;

    var deps = providerMap[id];

    if (deps === 'unloading') return;

    var onunload = unloads[id];

    if (onunload === 'reload') return reload();

    if (deps) {
      providerMap[id] = 'unloading';
      for(var key in deps) {
        unload(key);
      }
      delete providerMap[id];
    }

    if (typeof onunload === 'function')
      onunload(id);

    delete unloads[id];
    delete loaded[id];
    requirejs.undef(id);
  }

  function onunload(module, func) {
    unloads[typeof module === 'string' ? module : module.id] = func;
  }

  function reload() {
    console.log('=> Reloading');

    if (isServer) {
      require('kexec')(process.execPath, process.execArgv.concat(process.argv.slice(1)));
    } else {
      window.location.reload();
      throw "reloading"; // no point continuing
    }
  }

  /**
   * Dependency tracking and load/unload manager.
   * This module is also a requirejs loader plugin.
   */
  define(function (require, exports, module) {
    var util = require('./util-base');
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
            badIds.push("\tat app/"+modId+".js:1");
          }
        }
        return badIds;
      };
    } else {
      var discardIncompleteLoads = function () {
        return []; // FIXME what should I do on sever side?
      };
    }

    return {
      onunload: onunload,
      unload: unload,
      reload: reload,
      providerMap: providerMap,
      unloads: unloads,
      insertDependency: insertDependency,
      loaded: loaded,
      discardIncompleteLoads: discardIncompleteLoads,
      mode: module.config().mode,
      userId: function () {
        return util.thread.userId;
      },
      getLocation: function () {
        return window.location;
      },

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

      /**
       * Load a module for the current env -- client or server -- and
       * call {@unload} when ready.
       *
       * This function is used by requirejs to load a dependency of the
       * format: bart/env!<name> as client-<name>.js
       */
      load: function (name, req, onload, config) {
        var idx = name.lastIndexOf('/', name.length - 2) + 1;

        if (idx === 0) {
          var provider = prefix + name;
        } else {
          var provider = name.slice(0, idx) + prefix + name.slice(idx);
        }

        insertDependency(loaderPrefix + name, provider);

        req([provider], function (value) {
          onload(value);
        }, onload.error);
      },
    };
  });
})();
