define((require, exports, module)=>{
  const util            = require('koru/util');

  const {moduleName} = util;

  let pubs = Object.create(null);

  const publish = (pub) => {
    const {module, name=moduleName(module), init} = pub;
    if (module != null) {
      module.onUnload(() => {publish._destroy(name)});
    }

    if (init === undefined) throw new Error("Missing init method");
    if (pubs[name] !== undefined) throw new Error("Already published: " + name);

    pubs[name] = pub;
  };

  util.merge(publish, {
    get _pubs() {return pubs},
    _destroy(name) {delete pubs[name]},
  });

  module.onUnload(() => {pubs = Object.create(null);});

  return publish;
});
