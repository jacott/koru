var fs = require('fs');
var Path = require('path');
var WebSocketServer = require('ws').Server;
var http = require('http');
var express = require('express');
var send = require('send');
var parseurl = require('parseurl');

var app = express();

var opts = {root: Path.resolve(__dirname + '/../package') };

app.use('/package', function(req, res, next) {
  var path = parseurl(req).pathname;
  var m = /^(\/[^/]+)(\/.*)?$/.exec(path);
  if (! m) return error();

  var pname = m[1];
  if (! m[2]) {
    var mjs = /^(.*)\.js$/.exec(pname);
    if (! mjs) return error();
    pname = mjs[1];
    m[2] = '/main.js';
  }

  var path = pname+m[2];
  send(req, path, opts)
      .on('error', error)
    .on('directory', error)
    .pipe(res);

  function error(err) {
    if (! err || 404 === err.status) {
      res.statusCode = 404;
      res.end('NOT FOUND');
    } else {
      next(err);
    }
  }
});

app.use(express.static(__dirname + '/../client'));

var server = http.createServer(app);

var wss = new WebSocketServer({server: server});
wss.on('connection', function(ws) {
  ws.send(JSON.stringify(process.memoryUsage()), function() { /* ignore errors */ });
  ws.on('close', function() {
    console.log('stopping client interval');
  });
});

server.listen(3000);

function pathtype(path) {
  console.log('DEBUG pathtype', path);

  try {
    var stat = futureWrap(fs, fs.stat, [path]);
    return stat.isFile() ? 'file' : stat.isDirectory() ? 'dir' : 'other';
  } catch (ex) {
    if (ex.code === 'ENOENT')
      return;

    throw ex;
  }
}

function futureWrap(obj, func, args) {
  var future = new Future;
  var results;

  var callback = function (error, data) {
    if (error) {
      future.throw(error);
      return;
    }
    results = data;
    future.return();
  };
  args.push(callback);
  func.apply(obj, args);
  future.wait();
  return results;
}
