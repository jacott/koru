const fs = require('fs');
const path = require('path');
const yaajs = require('yaajs');
const cfg = require('./build-conf');
const Fiber = require('fibers');

global.requirejs = yaajs;
global.requirejs.nodeRequire = require;

Error.stackTraceLimit = 50;

const rootDir = cfg.rootDir;
const client = cfg.client;
const server = cfg.server;

yaajs.config(server.requirejs);

Fiber(function () {
  const deps = ['koru/main', 'koru/test/api-to-html',
                ...(server.extraRequires||[])];
  yaajs(deps, function (koru, toHtml) {
    const OUT_DIR = path.resolve(__dirname, '../doc');
    const argv = process.argv.slice(3);
    const json = JSON.parse(fs.readFileSync(`${OUT_DIR}/api.json`));


    const sourceHtml = fs.readFileSync(`${OUT_DIR}/api-template.html`).toString();

    const html = toHtml(argv[0] || 'Koru API', json, sourceHtml);

    fs.writeFileSync(`${OUT_DIR}/api.html`, `<!DOCTYPE html>\n${html}`);

    process.exit(0);
  });
}).run();
