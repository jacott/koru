const fs = require('fs');
const path = require('path');

function polyfill(mod) {
  const srcPath = require.resolve(mod);
  const destPath = path.resolve(__dirname, 'polyfill', path.basename(srcPath));

  if (! stat(destPath)) {
    try {fs.unlinkSync(destPath);} catch(ex) {}
    fs.symlinkSync(srcPath, destPath);
  }
}

function stat(file) {
  try {
    return fs.statSync(file);
  }
  catch(ex) {
    if (ex.code !== 'ENOENT')
      throw ex;
  }
}

polyfill('pepjs/dist/pep');

exports.polyfill = polyfill;

exports.common = function (cfg) {
  cfg.set('requirejs.packages', [
    "koru", "koru/session",
  ]);
};

exports.server = function (cfg) {
  cfg.merge('requirejs', {
    paths: {
      koru: __dirname
    },
    //Pass the top-level main.js/index.js require
    //function to requirejs so that node modules
    //are loaded relative to the top-level JS file.
  });
  cfg.set('startup', 'server');
  cfg.set('clientjs', 'client');
};

exports.client = function (cfg) {

};
