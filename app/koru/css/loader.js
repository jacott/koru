define(function(require, exports, module) {
  const koru = require('../main');

  class CssLoader {
    constructor(session) {
      this.session = session;
      session.provide('S', this.reloadCss.bind(this));
    }

    loadAll(dir) {
      this.session.send('S', 'LA'+dir);
    }

    reloadCss(data) {
      var type = data[0];
      var head = document.head;
      data.slice(1).split(" ").forEach(name => {

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
          if (this.callback)
            node.onload = this.callback;

          head.appendChild(node);
        }
      });
    }

    static  removeAllCss() {
      var head = document.head;
      var sheets = document.querySelectorAll('head>link[rel=stylesheet]');
      for(var i = 0; i < sheets.length; ++i) {
        head.removeChild(sheets[i]);
      }
    }
  }

  koru.onunload(module, CssLoader.removeAllCss);

  module.exports = CssLoader;
});
