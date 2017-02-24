define(function(require, exports, module) {
  const koru = require('../main');
  const util = require('../util');

  let pubs = Object.create(null);

  koru.onunload(module, () => {pubs = Object.create(null);});

  function publish(module, name, func) {
    if (typeof module === 'string') {
      func = name;
      name = module;
    } else {
      koru.onunload(module, () => {publish._destroy(name)});
      if (typeof name !== 'string') {
        func = name;
        name = util.capitalize(
          util.camelize(module.id.replace(/^.*\//, '').replace(/-(server|client)$/, '')));
      }
    }

    if (name in pubs) throw new Error("Already published: " + name);
    pubs[name] = func;
  }

  util.merge(publish, {
    get _pubs() {return pubs},
    _destroy(name) {delete pubs[name]},
  });

  return publish;
});
