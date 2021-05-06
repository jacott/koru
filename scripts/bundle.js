const Path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bundleAll = require('../lib/bundle-all');
const {default: generate} = require('@babel/generator');

const rootDir = process.env.KORU_HOME;

global.isTest = false;
global.isServer = true;
global.isClient = false;

console.log(`bundling`);

let version = process.env.KORU_APP_VERSION;

const hash = version ? crypto.createHash('md5') : void 0;

bundleAll.bundle({hash}, ({ast, css, compiler})=>{
  process.chdir(rootDir);

  if (hash !== void 0) {
    const idx = version.indexOf(",");
    if (idx != -1) {
      hash.update(version.slice(idx+1));
      version = version.slice(0,idx);
    }

    hash.update(css);
    version = version+","+hash.digest('hex');
    const vjs = compiler.parse(`window.KORU_APP_VERSION='${version}';`, {sourceFilename: 'version.js'}).program;

    vjs.body.push(...ast.program.body);
    ast.program.body = vjs.body;
  }

  console.log(`minifying`);

  const { code, error, map } = generate(ast, {
    compact: true,
    sourceMaps: true,
    sourceFileName: "index.js",
    sourceRoot: "/",
    comments: false,
  });

  if (error) {
    throw error;
  }

  version !== void 0 && fs.writeFileSync(Path.join("build", 'version.sh'),
                                         "export KORU_APP_VERSION="+version);
  fs.writeFileSync(Path.join("build", 'index.css'), css);
  fs.writeFileSync(Path.join("build", 'index.js'), code+"\n//# sourceMappingURL=index.js.map");
  fs.writeFileSync(Path.join("build", 'index.js.map'), JSON.stringify(map));
});
