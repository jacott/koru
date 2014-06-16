define(function(require, exports, module) {
  var util = require('../util');
  var koru = require('../main');

  koru.onunload(module, function () {
    pubs = {};
  });

  var pubs = {};

  function publish(name, func) {
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
