define(function(require, exports, module) {
  var core = require('../core');
  var session = require('../session/main');

  core.onunload(module, removeAllCss);

  session.provide('S', reloadCss);

  exports.reloadCss = reloadCss;
  exports.loadAll = loadAll;
  exports.removeAllCss = removeAllCss;

  function loadAll(dir) {
    session.send('S', 'LA'+dir);
  }

  function removeAllCss() {
    var head = document.head;
    var sheets = document.querySelectorAll('head>link[rel=stylesheet]');
    for(var i = 0; i < sheets.length; ++i) {
      head.removeChild(sheets[i]);
    }

  }

  function reloadCss(data) {
    var type = data[0];
    var head = document.head;
    data.slice(1).split(" ").forEach(function (name) {
      name = '/'+name+'.css';
      var node = head.querySelector('head>link[href="'+name+'"]');
      node && head.removeChild(node);

      if (type === 'L') {
        node = document.createElement('link');
        node.rel = 'stylesheet';
        node.async = true;
        node.href = name;
        if (exports.callback)
          node.onload = exports.callback;

        head.appendChild(node);
      }
    });
  }
});
