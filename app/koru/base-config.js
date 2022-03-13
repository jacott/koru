const fs = require('fs');
const path = require('path');

const polyfill = (modName, destname)=>{
  const srcPath = require.resolve(modName);
  const destPath = path.resolve(__dirname, 'polyfill', destname ?? path.basename(srcPath));

  if (! stat(destPath)) {
    try {fs.unlinkSync(destPath);} catch(ex) {}
    fs.symlinkSync(srcPath, destPath);
  }
};

const stat = file =>{
  try {
    return fs.statSync(file);
  }
  catch(ex) {
    if (ex.code !== 'ENOENT')
      throw ex;
  }
};

exports.polyfill = polyfill;

exports.common = cfg =>{
  cfg.set('requirejs.packages', [
    "koru", "koru/session",
  ]);
};

exports.server = cfg =>{
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

exports.client = cfg =>{

};
