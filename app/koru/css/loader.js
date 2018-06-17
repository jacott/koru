define((require, exports, module)=>{
  const koru            = require('../main');

  class CssLoader {
    constructor(session) {
      this.session = session;
      session.provide('S', this.reloadCss.bind(this));
    }

    loadAll(dir) {
      this.session.send('S', 'LA'+dir);
    }

    reloadCss(data) {
      const type = data[0];
      const head = document.head;
      data.slice(1).split(" ").forEach(name => {

        if (name.slice(-4) !== '.css') {
          const idx = name.lastIndexOf("/");
          if (idx === -1) return;
          name = name.slice(0, idx) + "/.build" + name.slice(idx) + '.css';
        }
        const node = head.querySelector('head>link[href="/'+name+'"]');
        node === null || node.remove();

        if (type === 'L') {
          const node = document.createElement('link');
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
      const {head} = document;
      const sheets = document.querySelectorAll('head>link[rel=stylesheet]');
      for(let i = 0; i < sheets.length; ++i) {
        sheets[i].remove();
      }
    }
  }

  koru.onunload(module, CssLoader.removeAllCss);

  return CssLoader;
});
