(function () {
  function browserVersion(ua){
    var tmp;
    var M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
    if(/trident/i.test(M[1])){
      tmp=  /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
      return 'IE '+(tmp[1] || '');
    }
    if((tmp= ua.match(/version\/([\.\d]+)/i))!= null) M[2]= tmp[1];
    return M.slice(1).join(' ');
  }

  var engine = typeof navigator === 'undefined' ? 'Server' : browserVersion(navigator.userAgent);

  if (engine === 'Server') {
    var top = global;
    top.isServer = true;
    top.isClient = false;
    var Fiber = require('fibers');

  } else {
    var top = window;
    top.isServer = false;
    top.isClient = true;
    var Fiber = function(func) {return {run: func}};
  }

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

    return {
      Fiber: Fiber,

      debug: function () {
        this.logger('DEBUG', arguments);
      },

      logger: function () {
        console.log.apply(console, arguments);
      },

      engine: engine,

      browserVersion: browserVersion,

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
