define(function(require, exports, module) {
  const koru            = require('koru');
  const Dom             = require('koru/dom');

  const toggleMenuScript = `(${(()=>{
    document.getElementById("mainMenu").addEventListener("click", event=>{
      event.stopImmediatePropagation();
      const {classList} = document.getElementById('pageHeader');
      if (classList.contains("menu-open"))
        classList.remove("menu-open");
      else {
        classList.add("menu-open");
        const elm = document.querySelector('.menu-open>nav:first-of-type [tabindex="0"]');
        elm && elm.focus();
      }
    });
    document.getElementById("pageHeader").addEventListener("click", event=>{
      event.stopImmediatePropagation();
      const {classList} = document.getElementById('pageHeader');
      if (classList.contains("menu-open"))
        classList.remove("menu-open");
    });
  }).toString()})()`;

  Dom.registerHelpers({
    versionHash() {
      return koru.versionHash;
    },

    title() {
      return `Change me in app/${module.id}.js`;
    },

    menuPages() {
      const frag = document.createDocumentFragment();
      [['sample1', 'Sample 1'],
       ['about', 'About'],
      ].forEach(row => {
        frag.appendChild(Dom.h({
          class: row[0], href: '/'+row[0], tabindex: "0", a: {span: row[1]},
        }));
      });
      return frag;
    },

    toggleMenu() {return toggleMenuScript},
  });

  return ({View}) => {
    View.$helpers({
      clientSuffix() {
        const {clientScript, loadScript} = this.controller.layoutData;
        if (clientScript || loadScript) {
          return Dom.h([
            loadScript === undefined ? '' : loadScript,
            clientScript === undefined ? '' :
              {script: `define('clientScript', ['client', '${clientScript}'], (_, o)=>{o.start()});`},
          ]);
        }
      },
    });
  };
});
