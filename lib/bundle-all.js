#!/usr/bin/env node
const Path = require('path');

const bundleCss = require('./bundle-css');
const bundleJs = require('./bundle-js');

exports.bundle = (options, callback) => {
  options = options || {};
  const topDir = options.topDir || Path.resolve(Path.join(process.cwd(), 'app'));
  try {
    const cssp = bundleCss(topDir, ['ui']);

    bundleJs.bundle(options, (result) => {
      cssp.then((css) => {
        result.css = css;
        callback(result);
      }).catch((err) => {
        process.stderr.write(err.stack);
        process.exit(1);
      });
    });
  } catch (err) {
    process.stderr.write(err.stack);
    process.exit(1);
  }
};
