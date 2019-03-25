define((require)=>{
  'use strict';
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const fst             = require('koru/fs-tools');
  const marked          = requirejs.nodeRequire('marked');
  const path            = requirejs.nodeRequire('path');

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  const compile = (type, path, outPath)=>{
    const src = fst.readFile(path).toString();
    fst.writeFile(outPath, marked.parse(src, mdOptions));
  };


  Compilers.set('md', compile);

  Dom.registerHelpers({
    markdown(file) {
      const {App} = this.controller;
      const dir = path.join(App._pageDirPath, path.dirname(file)), base = path.basename(file)+".md";
      try {
        return Compilers.read('md', path.join(dir, base), path.join(dir, '.build', base+".html"));
      } catch(ex) {
        if (ex.error === 404) return;
      }
    },
  });

});
