(function () {
  var index = document.getElementById('jsdoc-index');
  window.addEventListener('hashchange', highlightPage);

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(highlightPage, 1);
  });

  function highlightPage() {
    var id = window.location.hash.slice(1);
    var target = document.getElementById(id);
    var active = document.getElementsByClassName('jsdoc-active-page')[0];

    active && active.classList.remove('jsdoc-active-page');
    var nav = document.getElementsByClassName('jsdoc-nav-active-page')[0];
    nav && nav.classList.remove('jsdoc-nav-active-page');

    if (! target)
      return;

    target.classList.add('jsdoc-active-page');
    target.scrollIntoView(true);

    var nav = index.querySelector('[href="#'+id+'"]');
    nav && searchUpFor('jsdoc-nav-module', nav).classList.add('jsdoc-nav-active-page');
  }

  function searchUpFor(className, node) {
    for(; node && node.nodeType === document.ELEMENT_NODE; node = node.parentNode) {
      if (node.classList.contains(className))
        return node;
    }
  }
})();
