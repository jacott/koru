const path = require('path');
const fs = require('fs');
const requirejs = require('yaajs');

const {ctx} = requirejs.module;
requirejs.nodeRequire = require;

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
      ', isClient = true, isServer = false;yaajs.config(' +
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
    if (mod !== void 0 && result[mod.id] === void 0) {
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
