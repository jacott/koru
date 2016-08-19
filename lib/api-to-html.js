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

Fiber(function () {
  const deps = ['koru/main', 'koru/test/api-to-html',
                ...(server.extraRequires||[])];
  yaajs(deps, function (koru, toHtml) {
    const OUT_DIR = path.resolve(__dirname, '../doc');
    const argv = process.argv.slice(3);
    const cjson = fetch('client');
    const sjson = fetch('server');
    for (let key in cjson) {
      merge(key, cjson[key], sjson);
    }

    const sourceHtml = fs.readFileSync(`${OUT_DIR}/api-template.html`).toString();

    const html = toHtml(argv[0] || 'Koru API', sjson, sourceHtml);

    fs.writeFileSync(`${OUT_DIR}/api.html`, `<!DOCTYPE html>\n${html}`);

    function fetch(type) {
      try {
        return JSON.parse(fs.readFileSync(path.resolve(OUT_DIR, `api-${type}.json`)));
      } catch(ex) {
        if (ex.code === 'ENOENT')
          return {};
        throw ex;
      }
    }

    process.exit(0);
  });
}).run();

function merge(key, entry, json) {
  const dest = json[key];
  if (! dest) {
    json[key] = entry;
    return;
  }
  mergeList('requires');
  mergeList('modifies');
  mergeList('modifiedBy');

  function mergeList(attr) {
    if (entry[attr]) {
      if (dest[attr]) {
        dest[attr] = Array.from(
          new Set([...entry[attr], ...dest[attr]])
        ).sort();
      } else {
        dest[attr] = entry[attr];
      }
    }
  }
}
