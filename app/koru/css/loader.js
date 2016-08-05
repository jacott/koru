define(function(require, exports, module) {
  const koru = require('../main');

  koru.onunload(module, removeAllCss);

  module.exports = function (session) {
    const loader = {
      loadAll(dir) {
        session.send('S', 'LA'+dir);
      },

      reloadCss(data) {
        var type = data[0];
        var head = document.head;
        data.slice(1).split(" ").forEach(function (name) {

          if (name.slice(-4) !== '.css') {
            var idx = name.lastIndexOf("/");
            if (idx === -1) return;
            name = name.slice(0, idx) + "/.build" + name.slice(idx) + '.css';
          }
          var node = head.querySelector('head>link[href="/'+name+'"]');
          node && head.removeChild(node);

          if (type === 'L') {
            node = document.createElement('link');
            node.rel = 'stylesheet';
            node.async = true;
            node.href = '/'+name;
            if (loader.callback)
              node.onload = loader.callback;

            head.appendChild(node);
          }
        });
      },
    };

    session.provide('S', loader.reloadCss);

    return loader;
  };

  module.exports.removeAllCss = removeAllCss;

  function removeAllCss() {
    var head = document.head;
    var sheets = document.querySelectorAll('head>link[rel=stylesheet]');
    for(var i = 0; i < sheets.length; ++i) {
      head.removeChild(sheets[i]);
    }

  }
});
