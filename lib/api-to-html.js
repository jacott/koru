const fs = require('fs');
const path = require('path');
const yaajs = require('yaajs');
const cfg = require('./build-conf')('test');
const Fiber = require('fibers');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

yaajs.config(server.requirejs);

global.isServer = true;
global.isClient = false;

Fiber(()=>{
  const deps = ['koru/main', 'koru/test/api-to-html',
                ...(server.extraRequires||[])];
  let koru, toHtml;
  yaajs(deps, (_koru, _toHtml)=>{
    koru = _koru;
    toHtml = _toHtml;
  });

  const OUT_DIR = path.resolve(__dirname, '../doc');
  const argv = process.argv.slice(3);

  const fetch = type =>{
    try {
      return JSON.parse(fs.readFileSync(path.resolve(OUT_DIR, `api-${type}.json`)));
    } catch(ex) {
      if (ex.code === 'ENOENT')
        return {};
      throw ex;
    }
  };

  const merge = (key, entry, json)=>{
    let dest = json[key];
    if (dest === void 0) {
      json[key] = entry;
      entry.env = 'client';
      dest = {};
    } else {
      dest.env = 'both';
    }

    const mergeMap = attr =>{
      const srcMap = entry[attr];
      if (srcMap) {
        const destMap = dest[attr];
        if (destMap) {
          for (let key in srcMap) {
            if (! destMap[key]) {
              destMap[key] = srcMap[key];
              destMap[key].env = 'client';
            } else
              destMap[key].env = 'both';
          }
          if (key)
            return;
        }
        dest[attr] = srcMap;
        for (let key in srcMap) {
          srcMap[key].env = 'client';
        }
      }
    };

    const mergeList = attr =>{
      if (entry[attr]) {
        if (dest[attr]) {
          dest[attr] = Array.from(
            new Set([...entry[attr], ...dest[attr]])
          ).sort();
        } else {
          dest[attr] = entry[attr];
        }
      }
    };

    mergeList('requires');
    mergeList('modifies');
    mergeList('modifiedBy');
    mergeMap('methods');
    mergeMap('protoMethods');
    mergeMap('customMethods');
    mergeMap('properties');
    mergeMap('protoProperties');
    mergeMap('topics');
  };

  const cjson = fetch('client');
  const sjson = fetch('server');
  for (let key in cjson) {
    merge(key, cjson[key], sjson);
  }

  const sourceHtml = fs.readFileSync(`${OUT_DIR}/api-template.html`).toString();

  const html = toHtml(argv[0] || 'Koru API', sjson, sourceHtml);

  fs.writeFileSync(`${OUT_DIR}/api.html`, `<!DOCTYPE html>\n${html}`);
  process.exit(0);
}).run();
