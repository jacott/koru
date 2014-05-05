define(function (require, exports, module) {
  var WebSocketServer = require('ws').Server;
  var server = require('package/bart-webserver/index').server;

  var wss = new WebSocketServer({server: server});
  wss.on('connection', function(ws) {
    ws.send(JSON.stringify(process.memoryUsage()), function() { /* ignore errors */ });
    ws.on('close', function() {
      console.log('stopping client interval');
    });
  });

});
