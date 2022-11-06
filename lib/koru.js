'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {createRequire} = require('node:module');
const requirejs = require('./amd-loader');

const localReq = createRequire(process.cwd());
const {ctx} = requirejs.module;
requirejs.nodeRequire = (path) => {
  try {
    return require(path);
  } catch (err) {
    return localReq(path);
  }
};
requirejs.nodeRequire.resolve = (path) => require.resolve(path) ?? localReq.resolve(path);

const {KORU_ENV, KORU_APP_NAME, KORU_HOME} = process.env;

if (! (KORU_ENV && KORU_HOME)) {
  throw new Error('KORU_ENV and KORU_HOME env vars are not configured');
}

const isTest = global.isTest = KORU_ENV === 'test' ? Symbol() : false;
const isClient = global.isClient = false;
const isServer = global.isServer = true;

Error.stackTraceLimit = 100;

const {rootDir, client, server, stringify} = require('./build-conf')(KORU_ENV, KORU_HOME);

let clientjs = '';

const sendClientjs = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/x-javascript',
  });
  if (clientjs === '') {
    clientjs = 'const isTest = ' +
      (isTest ? 'Symbol()' : 'false') +
      ', isClient = true, isServer = false;requirejs.config(' +
      stringify(client.requirejs) + ');\n' +
      fs.readFileSync(path.join(server.requirejs.baseUrl, server.clientjs) + '.js');
  }
  res.end(clientjs);
};

process.title = `koru/${KORU_APP_NAME} ${KORU_ENV}`;

ctx.constructor.setGlobalName('requirejs');
ctx.config(server.requirejs);

globalThis.__koruThreadLocal.run({}, () => requirejs([
  'koru/server', 'koru/web-server', server.startup,
].concat(server.extraRequires || []), (koru, webServer, startup) => {
  webServer.registerHandler('client.js', sendClientjs);
  startup(server);
}, (err) => {
  const fetchDependants = (mod, result) => {
    if (mod !== undefined && result[mod.id] === undefined) {
      const {modules} = mod.ctx;
      for (let id in mod._requiredBy) {
        result[id] = true;
        fetchDependants(modules[id], result);
      }
    }
    return result;
  };

  const mod = err.module;

  const stack = Object.keys(fetchDependants(mod, {})).map(
    (id) => id === mod.id ? '' : '    at ' + id + '.js:1:1').join('\n');

  console.error(`ERROR: failed to load module: ${mod.id}
with dependancies:
${stack}
                   `);
  console.error(err.stack);
  process.exit(1);
}));
