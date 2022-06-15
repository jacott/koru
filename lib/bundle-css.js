const Path = require('path');
const {readdir, stat, readFile} = require('fs/promises');

const less = require('less');
const autoprefixer = require('autoprefixer')({browserlist: ['> 5%', 'last 2 versions']});
const postcss = require('postcss')([autoprefixer]);

async function *findAll(dirPath) {
  let m;
  const filenames = (await readdir(dirPath)).filter((fn) => /^[\w-]*(?:\.(css|less)$|$)/.test(fn));
  const stats = filenames.map((filename) => stat(Path.join(dirPath, filename)));

  for (let i = 0; i < filenames.length; ++i) {
    if ((await stats[i]).isDirectory()) {
      yield* await findAll(Path.join(dirPath, filenames[i]));
    } else if (m = filenames[i].match(/^\w(.*)(less|css)$/)) {
      if (m[0].match(/-test\.(le|c)?ss$/)) continue;
      yield [dirPath, m[0]];
    }
  }
}

const compile = async (dir, filename) => {
  filename = Path.join(dir, filename);
  const src = (await readFile(filename)).toString();

  return new Promise((resolve, reject) => {
    less.render(src, {
      syncImport: true,
      paths: [dir], // for @import
      compress: false,
    }, (error, output) => {
      if (error) {
        let fn = error.filename || filename;
        if (fn === 'input') fn = filename;
        reject(new Error(
          'Less compiler error: ' + error.message +
            "\n\tat - " + fn + ':' + error.line + ':' + (error.column + 1)));
      } else {
        postcss.process(output.css, {from: undefined}).then((result) => {
          result.warnings().forEach((warn) => {
            console.warn(warn.toString());
          });
          resolve(result.css);
        }, reject);
      }
    });
  });
};

module.exports = async (topDir, dirs) => {
  let imports = '';
  let css = '';

  for (const dir of dirs) {
    try {
      for await (const pair of findAll(Path.join(topDir, dir))) {
        css += (await compile(...pair))
          .replace(/^\s*@import\s+url.*$/mg, (m) => (imports += m, ''));
      }
    } catch(err) {
      if (err.code === void 0) throw err;
      if (err.code !== 'ENOENT') {
        throw new Error(err.message);
      }
    }
  }

  return imports + css;
};
