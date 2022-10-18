define((require, exports, module) => {
  'use strict';
  const Module = module.constructor;

  module.exports = (myCtx, v) => {
    v.loadModule = [];
    v.results = [];
    myCtx.loadModule = (mod) => {
      v.loadModule.push(mod);
    };

    function callback(arg) {v.callback = arg}

    function body(mod, a1, a2, a3, a4) {
      var args = new Array(arguments.length - 1);
      for (var i = 1; i < arguments.length; ++i) args[i - 1] = arguments[i];
      var modId = mod.id;
      v.results[modId] = args;
      return 'result_' + modId;
    }

    function prepare(mod, deps) {
      v.loadModule = [];
      Module._prepare(mod, ['module'].concat(deps ?? []), body);
      return v.loadModule;
    }

    function depGraph(pattern) {
      var loads = pattern.split(' ');

      var _requires = {};
      var loadOrder = loads.map((node) => {
        node = node.split('d');
        var id = 'm' + node[0];
        _requires[id] = (node[1] ?? '').split(',').map((d) => 'm' + d);
        return id;
      });

      myCtx.require(loadOrder[0], callback);
      var modules = myCtx.modules;
      loadOrder.forEach(function (id) {
        var mod = modules[id];
        if (! mod) {
          myCtx.require(id);
          mod = modules[id];
          if (! mod) {
            throw new Error('mod ' + id + ' not defined in ' + loadOrder);
          }
        }
        prepare(mod, _requires[id]);
      });

      return _requires;
    }

    return {depGraph, prepare};
  };
});
