define(function(require, exports, module) {
  var koru = require('../main');
  var session = require('../session/base');

  koru.onunload(module, removeAllCss);

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
        if (exports.callback)
          node.onload = exports.callback;

        head.appendChild(node);
      }
    });
  }
});
