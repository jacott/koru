(function () {
  window.addEventListener('hashchange', highlightPage);

  window.addEventListener("load", highlightPage);

  var activePages = document.getElementsByClassName('jsdoc-active-page');
  var activeNavs = document.getElementsByClassName('jsdoc-nav-active-page');

  function highlightPage() {
    var index = document.getElementById('jsdoc-index');
    var id = window.location.hash.slice(1);
    var target = document.getElementById(id);

    while (activePages.length > 0)
      activePages[0].classList.remove('jsdoc-active-page');

    while (activeNavs.length > 0)
      activeNavs[0].classList.remove('jsdoc-nav-active-page');

    if (! target)
      return;

    target.classList.add('jsdoc-active-page');
    var module = searchUpFor('jsdoc-module', target);
    if (module != null) {
      module.classList.add('jsdoc-active-page');
      if (module.classList.contains('jsdoc-innerSubject'))
        module.previousSibling.classList.add('jsdoc-active-page');
    }
    target.scrollIntoView(true);

    var nav = index.querySelector('[href="#'+id+'"]');
    if (nav) {
      var navmod = nav;
      while (navmod = searchUpFor('jsdoc-nav-module', navmod.parentNode))
        navmod.classList.add('jsdoc-nav-active-page');
    }
  }

  function searchUpFor(className, node) {
    for(; node && node.nodeType === document.ELEMENT_NODE; node = node.parentNode) {
      if (node.classList.contains(className))
        return node;
    }
  }
})();
