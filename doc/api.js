'use strict';

{
  const activePages = document.getElementsByClassName('jsdoc-active-page');
  const activeNavs = document.getElementsByClassName('jsdoc-nav-active-page');

  const searchArea = document.getElementById('search');
  const searchInput = searchArea.querySelector('[name=search]');

  const index = document.getElementById('jsdoc-index');
  const main = document.querySelector('body>section>main');
  const pageContent = document.getElementsByClassName('page-content')[0];
  const pages = pageContent.childNodes;

  const results = document.createElement('div');
  results.id = 'Results';
  results.tabIndex = 1;
  results.addEventListener('click', event =>{results.remove()}, true);

  const selectedSearchResults = document.getElementsByClassName('search-result-selected');

  const keyListener = event =>{
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
        if (selectedSearchResults.length != 0) {
          window.location.href = selectedSearchResults[0].href;
        }
        results.remove();
        searchInput.blur();
        break;
      }
      return;
    case 9:
      if (event.target === searchInput && results.firstChild) {
        results.firstChild.focus();
        break;
      }
    case 38:
    case 40:
      if (selectedSearchResults.length != 0) {
        var elm = selectedSearchResults[0];
        elm.classList.remove('search-result-selected');
        (event.which == 38 ?
         elm.previousSibling || elm.parentNode.lastChild :
         elm.nextSibling || elm.parentNode.firstChild).classList.add('search-result-selected');
      }
      break;
    default:
      return;
    }
    event.preventDefault();
  };

  const focusSearch = event =>{
    searchInput.select();
    event.preventDefault();
  };

  const search = event =>{
    searchPage(searchInput.value.trim());
  };

  const findId = elm =>{
    while(elm && elm.nodeType === 1) {
      if (elm.id) return elm.id;
      elm = elm.parentNode;
    }
    return '';
  };

  const searchPage = query =>{
    while(results.firstChild) results.firstChild.remove();

    if (query === '') return;

    const len = pages.length;
    let count = 0;

    const mcs = query.toLowerCase() != query;

    const parts = query.split(/\s+/);
    const p0 = parts[0];

    loops:
    for(let i = 0; i < len; ++i) {
      const page = pages[i];
      if (page.nodeType !== 1) continue;
      const topics = page.getElementsByClassName('searchable');
      for(let k = 0; k < topics.length; ++k) {
        const topic = topics[k];
        const text = topic.textContent;
        const idx = mcs ? text.indexOf(p0) : text.toLowerCase().indexOf(p0);
        if (idx !== -1) {
          const a = document.createElement('a');
          const id = findId(topic);
          a.setAttribute('href', '#'+id);
          const mod = document.createElement('span');
          mod.textContent = id;
          a.appendChild(mod);

          let ts = document.createElement('span');
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
    const lines = results.childNodes;
    for(let i = 1; i < parts.length; ++i) {
      const part = parts[i];
      for(let k = lines.length-1; k >= 0; --k) {
        const nodes = lines[k].childNodes;
        if (mcs
            ? (nodes[1].textContent.indexOf(part) === -1 &&
               nodes[3].textContent.indexOf(part) === -1)
            : (nodes[1].textContent.toLowerCase().indexOf(part) === -1 &&
               nodes[3].textContent.toLowerCase().indexOf(part) === -1))
          lines[k].remove();
      }
    }
    results.firstChild !== null &&
      results.firstChild.classList.add('search-result-selected');
    main.insertBefore(results, main.firstChild);
  };

  const highlightPage = ()=>{
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);

    while (activePages.length > 0)
      activePages[0].classList.remove('jsdoc-active-page');

    while (activeNavs.length > 0)
      activeNavs[0].classList.remove('jsdoc-nav-active-page');

    if (! target)
      return;

    target.classList.add('jsdoc-active-page');
    const module = searchUpFor('jsdoc-module', target);
    if (module != null) {
      module.classList.add('jsdoc-active-page');
      if (module.classList.contains('jsdoc-innerSubject'))
        module.previousSibling.classList.add('jsdoc-active-page');
    }

    const nav = index.querySelector('[href="#'+id+'"]');
    if (nav) {
      let navmod = nav;
      while (navmod = searchUpFor('jsdoc-nav-module', navmod.parentNode))
        navmod.classList.add('jsdoc-nav-active-page');

      nav.scrollIntoView({block: 'center'});
    }

    target.scrollIntoView(true);
    if (document.activeElement !== target) target.focus();
  };

  const searchUpFor = (className, node)=>{
    for(; node && node.nodeType === document.ELEMENT_NODE; node = node.parentNode) {
      if (node.tagName === className || node.classList.contains(className))
        return node;
    }
  };

  window.addEventListener('keydown', keyListener, true);
  window.addEventListener('hashchange', highlightPage);
  window.addEventListener("load", highlightPage);

  searchArea.addEventListener('mousedown', focusSearch, true);
  searchArea.addEventListener('input', search, true);
}
