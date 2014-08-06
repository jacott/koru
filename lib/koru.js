var path = require('path');
var fs = require('fs');

var rootDir = path.resolve(process.cwd(), '..');

var requirejs = require('../node_modules/requirejs');

var base = require('../app/koru/base-config');
var common = require(path.resolve(rootDir, 'config/common-config'));

var env = require(path.resolve(rootDir, 'config/', (process.argv[2] || 'demo')+'-config'));

var target;
var cfg = {
  merge: function (key, value) {
    var pair = lookupDottedKey(key, target);
    var orig = pair[0][pair[1]];
    if (! orig) {
      pair[0][pair[1]] = value;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (v) {
        orig.push(v);
      });
    } else {
      extend(orig, value);
    }
  },

  set: function (key, value) {
    var pair = lookupDottedKey(key, target);
    pair[0][pair[1]] = value;
  },
};

var server = config('server');

var client = config('client');

var clientjs = "requirejs.config(" + JSON.stringify(client.requirejs) + ");\n" +
fs.readFileSync(path.join(server.requirejs.baseUrl, server.clientjs) +'.js');

function sendClientjs(req, res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-javascript',
  });
  res.end(clientjs);
}

requirejs.config(server.requirejs);

requirejs(['koru', 'koru/web-server', server.startup].concat(server.extraRequires||[]), function (koru, webServer, startup) {
  webServer.registerHandler('client.js', sendClientjs);
  koru.Fiber(function () {
    typeof startup === 'function' && startup(server);
    webServer.start();

    console.log('=> Ready');
  }).run();
});



function extend(obj, properties) {
  for(var prop in properties) {
    Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
  }
  return obj;
}

function lookupDottedKey(key, attrs) {
  var parts = key.split('.');
  for(var i = 0; i + 1 < parts.length; ++i) {
    var row = parts[i];
    attrs = attrs[row] || (attrs[row] = {});
  }
  return [attrs, parts[i]];
}

function config(type) {
  target = {};
  [base, common, env].forEach(function (n) {
    n.common && n.common(cfg);
    n[type] && n[type](cfg);
  });
  return target;
}
