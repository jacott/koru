const Path = require('path');
const fsp = require('fs/promises');
const less = requirejs.nodeRequire('less');
const autoprefixer = requirejs.nodeRequire('autoprefixer')({browserlist: ['> 5%', 'last 2 versions']});
const postcss = requirejs.nodeRequire('postcss')([autoprefixer]);

define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const Future          = require('koru/future');

  const topLen = Path.resolve(koru.appDir).length + 1;

  const sendPaths = {};

  const compile = async (type, path, outPath) => {
    const dir = Path.dirname(path);

    const src = (await fsp.readFile(path)).toString();

    const filename = path.substring(topLen - 1);

    try {
      const output = await less.render(src, {
        syncImport: true,
        paths: [dir], // for @import
        filename,
        sourceMap: {
          sourceMapFileInline: true,
        },
      });
      const result = await postcss.process(output.css, {from: void 0});
      result.warnings().forEach((warn) => {
        console.warn(warn.toString());
      });
      await fsp.writeFile(outPath, result.css);
    } catch (error) {
      let fn = error.filename || path;
      if (fn === 'input') fn = path;
      if (fn[0] === '/') fn = fn.slice(1);
      koru.error(`Less compiler error: ${error.message}
    at - ${fn}:${error.line}:${error.column + 1}
`);
    }
  };

  koru.onunload(module, 'reload');

  Compilers.set('less', compile);

  exports._less = less;
  exports.compile = compile;
});
