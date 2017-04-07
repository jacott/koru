const Future = require('fibers/future');
const wait = Future.wait;
const fs = require('fs');
const Path = require('path');
const readdir = Future.wrap(fs.readdir);
const stat = Future.wrap(fs.stat);

const less = require('less');
const autoprefixer = require("autoprefixer")({browsers: ['> 5%', 'last 2 versions']});
const postcss = require("postcss")([autoprefixer]);
const cleanCss = require('clean-css');

function findAll(dirPath, results) {
  let m;
  const filenames = readdir(dirPath).wait().filter(function (fn) {
    return /^[\w-]*(?:\.(css|less)$|$)/.test(fn);
  });
  const stats = filenames.map(function (filename) {
    return stat(Path.join(dirPath, filename));
  });

  wait(stats);

  for(let i = 0; i < filenames.length; ++i) {
    if (stats[i].get().isDirectory()) {
      findAll(Path.join(dirPath, filenames[i]), results);
    } else if (m = filenames[i].match(/^\w(.*)(less|css)$/)) {
      if (m[0].match(/-test\.(le|c)?ss$/)) continue;
      results.push([dirPath, m[0]]);
    }
  }
  return results;
}

function compile(dir, filename) {
  filename = Path.join(dir, filename);
  const src = fs.readFileSync(filename).toString();
  const future = new Future;

  less.render(src, {
    syncImport: true,
    paths: [dir], // for @import
    compress: false,
  }, function (error, output) {
    if (error) {
      let fn = error.filename || filename;
      if (fn === 'input') fn = filename;
      future.throw({
        toString() {return "Less compiler error: " + error.message},
        stack: "\tat "+ fn + ':' + error.line + ':' + (error.column + 1),
      });
    } else {
      postcss.process(output.css).then(function (result) {
        result.warnings().forEach(function (warn) {
          console.warn(warn.toString());
        });
        future.return(result.css);
      });
    }
  });

  return future.wait();
}

module.exports = bundleCss;

function bundleCss(topDir, dirs) {
  const imports = [];
  const css = dirs.map(function (dir) {
    return findAll(Path.join(topDir, dir), []).map(function (pair) {
      return compile(pair[0], pair[1]).replace(/^\s*@import\s+url.*$/mg, function (m) {
        imports.push(m);
        return '';
      });
    }).join("\n");
  }).join("\n");

  return imports.join("\n") + '\n' + (css// new cleanCss({
  //   processImport: false,
  //   semanticMerging: true,
  // }).minify(css).styles
                                     );
};
