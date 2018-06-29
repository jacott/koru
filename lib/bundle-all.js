#!/usr/bin/env node
const Fiber = require('fibers');
const Path = require('path');

const bundleCss = require('./bundle-css');
const bundleJs = require('./bundle-js');

exports.bundle = (options, callback)=>{
  options = options || {};
  const topDir = options.topDir || Path.resolve(Path.join(process.cwd(), 'app'));
  Fiber(()=>{
    try {
      const css = bundleCss(topDir, ['ui']);

      bundleJs.bundle(options, result =>{
        result.css = css;
        callback(result);
      });
    } catch(ex) {
      process.stderr.write(ex.stack);
      process.exit(1);
    }
  }).run();
};
