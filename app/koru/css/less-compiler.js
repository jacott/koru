const Path = require('path');
const less = requirejs.nodeRequire("less");
const Future = requirejs.nodeRequire('fibers/future');
const autoprefixer = requirejs.nodeRequire("autoprefixer")({browserlist: ['> 5%', 'last 2 versions']});
const postcss = requirejs.nodeRequire("postcss")([autoprefixer]);

define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const fst             = require('koru/fs-tools');


  const topLen = Path.resolve(koru.appDir).length + 1;

  const sendPaths = {};

  const compile = (type, path, outPath)=>{
    const dir = Path.dirname(path);

    const src = fst.readFile(path).toString();
    const future = new Future;

    const filename = path.substring(topLen - 1);

    less.render(src, {
      syncImport: true,
      paths: [dir], // for @import
      filename,
      sourceMap: {
        sourceMapFileInline: true,
      },
    }, (error, output)=>{
      if (error) {
        let fn = error.filename || path;
        if (fn === 'input') fn = path;
        if (fn[0] === '/') fn = fn.slice(1);
        koru.error(koru.util.extractError({
          toString: ()=> "Less compiler error: " + error.message,
          stack: "\tat "+ fn + ':' + error.line + ':' + (error.column + 1),
        })+"\n");
        future.return(null);
      } else {
        postcss.process(output.css, {from: undefined}).then(result => {
          result.warnings().forEach(warn=> {
            console.warn(warn.toString());
          });
          future.return(result.css);
        }, err => {future.throw(err)});
      }
    });

    const css = future.wait();

    css && fst.writeFile(outPath, css);
  };

  koru.onunload(module, 'reload');

  Compilers.set('less',compile);

  exports._less = less;
  exports.compile = compile;
});
