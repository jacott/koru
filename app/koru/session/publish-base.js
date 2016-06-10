define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');

  koru.onunload(module, function () {
    pubs = Object.create(null);
  });

  var pubs = Object.create(null);

  function publish(module, name, func) {
    if (typeof module === 'string') {
      func = name;
      name = module;
    } else {
      koru.onunload(module, function () {
        publish._destroy(name);
      });
      if (typeof name !== 'string') {
        func = name;
        name = util.capitalize(util.camelize(module.id.replace(/^.*\//, '').replace(/-(server|client)$/, '')));
      }
    }

    if (name in pubs) throw new Error("Already published: " + name);
    pubs[name] = func;
  }

  util.extend(publish, {
    get _pubs() {return pubs},
    _destroy: function (name) {
      delete pubs[name];
    },
  });

  return publish;
});
