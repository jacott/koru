const Future = require('fibers/future');
const wait = Future.wait;
const fs = require('fs');
const Path = require('path');
const readdir = Future.wrap(fs.readdir);
const stat = Future.wrap(fs.stat);

const less = require('less');
const autoprefixer = require("autoprefixer")({browserlist: ['> 5%', 'last 2 versions']});
const postcss = require("postcss")([autoprefixer]);

const findAll = (dirPath, results)=>{
  let m;
  const filenames = readdir(dirPath).wait().filter(fn => /^[\w-]*(?:\.(css|less)$|$)/.test(fn));
  const stats = filenames.map(filename => stat(Path.join(dirPath, filename)));

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
};

const compile = (dir, filename)=>{
  filename = Path.join(dir, filename);
  const src = fs.readFileSync(filename).toString();
  const future = new Future;

  less.render(src, {
    syncImport: true,
    paths: [dir], // for @import
    compress: false,
  }, (error, output)=>{
    if (error) {
      let fn = error.filename || filename;
      if (fn === 'input') fn = filename;
      future.throw(new Error(
        "Less compiler error: " + error.message +
          "\n\tat - "+ fn + ':' + error.line + ':' + (error.column + 1)));
    } else {
      postcss.process(output.css, {from: undefined}).then(result => {
        result.warnings().forEach(warn=> {
          console.warn(warn.toString());
        });
        future.return(result.css);
      }, err => {future.throw(err)});
    }
  });

  return  future.wait();
};

module.exports = (topDir, dirs)=>{
  const imports = [];
  const css = dirs.map(
    dir => findAll(Path.join(topDir, dir), []).map(
      pair => compile(pair[0], pair[1]).replace(/^\s*@import\s+url.*$/mg, m => (
        imports.push(m), ''))).join(''));

  return imports.join("") + css.join('');
};
