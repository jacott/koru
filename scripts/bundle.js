const Path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bundleAll = require('../lib/bundle-all');

const rootDir = process.env.KORU_HOME;

global.isTest = false;
global.isServer = true;
global.isClient = false;

console.log(`bundling`);

const isCompress = process.argv[3] !== 'quick';

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
  }

  console.log(`minifying`);

  const { code, error, map } = compiler.terser.minify(ast, {
    compress: isCompress && {
      dead_code: true,
      global_defs: {
        isClient: true,
        isServer: false,
        isTest: false,
      },
      ecma: 6,
    },
    mangle: isCompress,
    safari10: true,
    sourceMap: {
      filename: "index.js",
      url: "index.js.map"
    },
    output: {
      beautify: ! isCompress,
      indent_level: isCompress ? 0 : 2,
      ast: false,
      code: true,
      preamble: version ? `window.KORU_APP_VERSION='${version}';` : void 0,
    }
  });

  if (error) {
    throw error;
  }

  version !== void 0 && fs.writeFileSync(Path.join("build", 'version.sh'),
                                         "export KORU_APP_VERSION="+version);
  fs.writeFileSync(Path.join("build", 'index.css'), css);
  fs.writeFileSync(Path.join("build", 'index.js'), code);
//  fs.writeFileSync(Path.join("build", 'config.js'), configCode);
  fs.writeFileSync(Path.join("build", 'index.js.map'), map);
});
