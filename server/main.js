// var express = require('express');

// var app = express(); /* express.createServer will not work here */
// var http = require('http');
// var sockjs = require('sockjs');

// // 1. Echo sockjs server
// var sockjs_opts = {sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js"};

// var sockjs_echo = sockjs.createServer(sockjs_opts);
// sockjs_echo.on('connection', function(conn) {
//     conn.on('data', function(message) {
//         conn.write(message);
//     });
// });


// // 3. Usual http stuff
// var server = http.createServer(app);
// server.addListener('upgrade', function(req,res){
//     res.end();
// });

// sockjs_echo.installHandlers(server, {prefix:'/echo'});

// app.use(function(req, res, next){
//   res.send('Hello Bart World');
// });

// server.listen(3000); /*listen on http server instead of express app */



var WebSocketServer = require('ws').Server
  , http = require('http')
  , express = require('express')
  , app = express();

app.use('/package', express.static(__dirname + '/../package'));

app.use(express.static(__dirname + '/../client'));

app.use(function(req, res, next){
  res.send('Hello Bart World');
});

var server = http.createServer(app);

var wss = new WebSocketServer({server: server});
wss.on('connection', function(ws) {
  var id = setInterval(function() {
    ws.send(JSON.stringify(process.memoryUsage()), function() { /* ignore errors */ });
  }, 1000);
  console.log('started client interval');
  ws.on('close', function() {
    console.log('stopping client interval');
    clearInterval(id);
  });
});

server.listen(3000);
