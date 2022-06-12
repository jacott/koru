define((require) => {
  'use strict';
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const HTMLDocument    = require('koru/dom/html-doc');
  const fst             = require('koru/fs-tools');

  const marked = requirejs.nodeRequire('marked');
  const path = requirejs.nodeRequire('path');

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  const compile = async (type, path, outPath) => {
    const src = (await fst.readFile(path)).toString();
    await fst.writeFile(outPath, marked.parse(src, mdOptions));
  };

  Compilers.set('md', compile);

  class RawNode extends HTMLDocument.prototype.createTextNode().constructor {
    get innerHTML() {return this.data}
    set innerHTML(value) {this.data = value}
  }

  HTMLDocument.prototype.createRawNode = (value='') => new RawNode(value);

  const populateNode = async (node, p) => {
    try {
      const text = (await p) ?? '';
      node.data = text.toString();
    } catch (err) {
      if (err.error !== 404) throw err;
    }
  };

  const addAsyncReadFile = (ctl, textFunc) => {
    const node = new RawNode('');
    ctl.addPromise(populateNode(node, textFunc(ctl)));
    return node;
  };

  Dom.registerHelpers({
    markdown(file) {
      return addAsyncReadFile(this.controller, ({App}) => {
        const dir = path.join(App._pageDirPath, path.dirname(file)), base = path.basename(file) + '.md';
        return Compilers.read('md', path.join(dir, base), path.join(dir, '.build', base + '.html'));
      });
    },

    less(file) {
      return addAsyncReadFile(this.controller, ({App}) => {
        const dir = path.join(App._pageDirPath, path.dirname(file)), base = path.basename(file) + '.less';
        return Compilers.read('less', path.join(dir, base), path.join(dir, '.build', base + '.css'));
      });
    },

    css(file) {
      return addAsyncReadFile(this.controller, async ({App}) => {
        return fst.readFile(path.join(App._pageDirPath, file + '.css'));
      });
    },

    controllerId() {return this.controller.constructor.modId},

    page() {return this.controller.pathParts[0] || 'root'},
  });
});
