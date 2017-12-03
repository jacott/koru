define(function(require, exports, module) {
  const koru            = require('../main');
  const util            = require('../util');

  let pubs = Object.create(null);
  const preload$ = Symbol();

  koru.onunload(module, () => {pubs = Object.create(null);});

  const publish = ({module, name=nameFromModule(module), init, preload}) => {
    if (module) {
      koru.onunload(module, () => {publish._destroy(name)});
    }

    if (pubs[name] !== undefined) throw new Error("Already published: " + name);
    pubs[name] = init;
    if (preload) init[preload$] = preload;
  };

  util.merge(publish, {
    get _pubs() {return pubs},
    preload(sub, callback) {
      const preload = sub._subscribe && sub._subscribe[preload$];
      const promise = preload && preload(sub);
      if (promise && promise.then)
        promise.then(() => {callback()}, err => {callback(err)});
      else
        callback();
    },
    _destroy(name) {delete pubs[name]},
  });

  const nameFromModule = module => util.capitalize(util.camelize(
    module.id.replace(/^.*\/(publish-)?/, '').replace(/-(server|client)$/, '')));

  return publish;
});
