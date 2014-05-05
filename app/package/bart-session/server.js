define(function (require, exports, module) {
  var WebSocketServer = require('ws').Server;
  var server = require('package/bart-webserver/server').server;

  var wss = new WebSocketServer({server: server});
  wss.on('connection', function(ws) {
    ws.on('close', function() {
      console.log('stopping client interval');
    });
    ws.on('message', function(data, flags) {
      console.log('DEBUG data, flags',data, flags);
    });
    ws.send("L:test/loading-test", function() { /* ignore errors */ });
  });

});
