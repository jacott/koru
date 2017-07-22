const Path = require('path');
const less = requirejs.nodeRequire("less");
const Future = requirejs.nodeRequire('fibers/future');
const autoprefixer = requirejs.nodeRequire("autoprefixer")({browsers: ['> 5%', 'last 2 versions']});
const postcss = requirejs.nodeRequire("postcss")([autoprefixer]);

define(function(require, exports, module) {
  const fst       = require('../fs-tools');
  const koru      = require('../main');
  const webServer = require('../web-server');

  koru.onunload(module, 'reload');

  webServer.compilers['less'] = compile;

  const topLen = Path.resolve(koru.appDir).length + 1;

  const sendPaths = {};

  exports._less = less;
  exports.compile = compile;

  function compile(type, path, outPath) {
    const dir = Path.dirname(path);

    const src = fst.readFile(path).toString();
    const future = new Future;

    less.render(src, {
      syncImport: true,
      paths: [dir], // for @import
      filename: path.substring(topLen - 1),
      sourceMap: {
        sourceMapFileInline: true,
      },
    }, function (error, output) {
      if (error) {
        let fn = error.filename || path;
        if (fn === 'input') fn = path;
        if (fn[0] === '/') fn = fn.slice(1);
        koru.error(koru.util.extractError({
          toString() {return "Less compiler error: " + error.message},
          stack: "\tat "+ fn + ':' + error.line + ':' + (error.column + 1),
        })+"\n");
        future.return(null);
      } else {
        postcss.process(output.css).then(result => {
          result.warnings().forEach(warn=> {
            console.warn(warn.toString());
          });
          future.return(result.css);
        }, err => {future.throw(err)});
      }
    });

    const css = future.wait();

    css && fst.writeFile(outPath, css);
  }
});
