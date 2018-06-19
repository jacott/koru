(function () {
  var activePages = document.getElementsByClassName('jsdoc-active-page');
  var activeNavs = document.getElementsByClassName('jsdoc-nav-active-page');

  var searchArea = document.getElementById('search');
  var searchInput = searchArea.querySelector('[name=search]');

  var index = document.getElementById('jsdoc-index');
  var main = document.querySelector('body>section>main');
  var pageContent = document.getElementsByClassName('page-content')[0];
  var pages = pageContent.childNodes;

  var results = document.createElement('div');
  results.id = 'Results';
  results.tabIndex = 1;
  results.addEventListener('click', function (event) {
    results.remove();
  }, true);

  window.addEventListener('keydown', keyListener, true);
  searchArea.addEventListener('mousedown', focusSearch, true);
  searchArea.addEventListener('input', search, true);

  function keyListener(event) {
    switch(event.which) {
    case 191:
      if (event.target !== searchInput)
        focusSearch(event);
      return;
    case 27:
      if (event.target === searchInput) {
        results.remove();
        searchInput.blur();
        break;
      }
      return;
    case 13:
      if (event.target === searchInput) {
        results.remove();
        searchInput.blur();
        if (results.firstChild) {
          window.location.href = results.firstChild.href;
        }
        break;
      }
      return;
    case 9:
      if (event.target === searchInput && results.firstChild) {
        results.firstChild.focus();
        break;
      }
    default:
      return;
    }
    event.preventDefault();
  }

  function focusSearch(event) {
    searchInput.select();
    event.preventDefault();
  }

  function search(event) {
    searchPage(searchInput.value.trim());
  }

  function findId(elm) {
    while(elm && elm.nodeType === 1) {
      if (elm.id) return elm.id;
      elm = elm.parentNode;
    }
    return '';
  }

  function searchPage(query) {
    while(results.firstChild) results.firstChild.remove();

    if (query === '') return;

    var len = pages.length;
    var count = 0;

    var mcs = query.toLowerCase() != query;

    var parts = query.split(/\s+/);
    var p0 = parts[0];

    loops:
    for(var i = 0; i < len; ++i) {
      var page = pages[i];
      if (page.nodeType !== 1) continue;
      var topics = page.getElementsByClassName('searchable');
      for(let k = 0; k < topics.length; ++k) {
        var topic = topics[k];
        var text = topic.textContent;
        var idx = mcs ? text.indexOf(p0) : text.toLowerCase().indexOf(p0);
        if (idx !== -1) {
          var a = document.createElement('a');
          var id = findId(topic);
          a.setAttribute('href', '#'+id);
          var mod = document.createElement('span');
          mod.textContent = id;
          a.appendChild(mod);

          var ts = document.createElement('span');
          ts.textContent = text.slice(0, idx);
          a.appendChild(ts);

          ts = document.createElement('b');
          ts.textContent = text.slice(idx, idx+p0.length);
          a.appendChild(ts);

          ts = document.createElement('span');
          ts.textContent = text.slice(idx+p0.length);
          a.appendChild(ts);

          results.appendChild(a);
          if (++count > 30) break loops;
        }
      }
    }
    var lines = results.childNodes;
    for(let i = 1; i < parts.length; ++i) {
      var part = parts[i];
      for(let k = lines.length-1; k >= 0; --k) {
        var nodes = lines[k].childNodes;
        if (mcs
            ? (nodes[1].textContent.indexOf(part) === -1 &&
               nodes[3].textContent.indexOf(part) === -1)
            : (nodes[1].textContent.toLowerCase().indexOf(part) === -1 &&
               nodes[3].textContent.toLowerCase().indexOf(part) === -1))
          lines[k].remove();
      }
    }

    main.insertBefore(results, main.firstChild);
  }

  function highlightPage() {
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
      if (node.tagName === className || node.classList.contains(className))
        return node;
    }
  }

  window.addEventListener('hashchange', highlightPage);

  window.addEventListener("load", highlightPage);

})();
