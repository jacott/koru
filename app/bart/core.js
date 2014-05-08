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

    return {
      engine: (function(){
        if (typeof navigator === 'undefined')
          return 'Server';
        var ua= navigator.userAgent, tem,
            M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*([\d\.]+)/i) || [];
        if(/trident/i.test(M[1])){
          tem=  /\brv[ :]+(\d+(\.\d+)?)/g.exec(ua) || [];
          return 'IE '+(tem[1] || '');
        }
        M= M[2]? [M[1], M[2]]:[navigator.appName, navigator.appVersion, '-?'];
        if((tem= ua.match(/version\/([\.\d]+)/i))!= null) M[2]= tem[1];
        return M.join(' ');
      })(),

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
