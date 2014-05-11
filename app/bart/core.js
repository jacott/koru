/*global requirejs define isServer require navigator window global console process*/

(function () {
  var depMap = {};
  var unloads = {};

  requirejs.onResourceLoad = function (context, map, depArray) {
    if (depArray) for(var i = 0; i < depArray.length; ++i) {
      var row = depArray[i];
      var id = row.id;
      if (id === 'require' || id === 'exports' || id === 'module')
        continue;

      (depMap[id] = depMap[id] || []).push(map.id);
    }
  };

  define(['module', './util'], function (module, util) {
    onunload(module, 'reload');

    return (isServer ? global : window)._bart_ = {
      Fiber: isServer ? require('fibers') : function(func) {return {run: func}},

      util: util,

      debug: function () {
        this.logger('DEBUG', Array.prototype.slice.call(arguments, 0));
      },

      info: function () {
        this.logger('INFO ' + Array.prototype.join.call(arguments, ' '));
      },

      logger: function () {
        console.log.apply(console, arguments);
      },

      onunload: onunload,
      unload: function unload(id) {
        if (! requirejs.defined(id)) return;

        var deps = depMap[id];

        if (deps === 'unloading') return;

        var onunload = unloads[id];

        if (onunload === 'reload')
          reload();

        if (deps) {
          depMap[id] = 'unloading';
          for(var i = 0; i < deps.length; ++i) {
            unload(deps[i]);
          }
          delete depMap[id];
        }

        if (typeof onunload === 'function')
          onunload(id);

        requirejs.undef(id);
      },

      depMap: depMap,

      unloads: unloads,

      reload: reload,

      util: util,
    };

    function onunload(module, func) {
      unloads[module.id] = func;
    }

    function reload() {
      console.log('=> Reloading');

      if (typeof process !== 'undefined' && process.hasOwnProperty('exit')) {
        require('kexec')(process.execPath, process.execArgv.concat(process.argv.slice(1)));
      } else
        window.location.reload();
    }

  });
})();
