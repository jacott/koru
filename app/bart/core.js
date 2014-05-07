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

  define(['module'], function (module) {
    onunload(module, 'reload');
    return {
      onunload: onunload,
      unload: function unload(id) {
        if (! requirejs.defined(id)) return;

        var deps = depMap[id];

        if (deps === 'unloading') return;

        var onunload = unloads[id];

        console.log('INFO: unload',id, onunload);

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

      reload: reload
    };

    function onunload(module, func) {
      unloads[module.id] = func;
    }

    function reload() {
      if (typeof process !== 'undefined' && process.hasOwnProperty('exit'))
        process.exit(2);
      else
        window.location.reload();
    }
  });
})();
