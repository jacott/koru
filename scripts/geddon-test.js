process.chdir(__dirname + "/..");

var net = require('net'),
    fs = require('fs');

var ARGV = process.argv.slice(2);

var runTime;

var exitCode = 0;
var WebSocket = require('ws');

var sessionCount = ARGV[0] === 'both' ? 2 : 1;

ARGV.push(ARGV[0] === 'server' ? 0 : 1);

var ws = new WebSocket('ws://localhost:3000/rc');
ws.on('open', runTests);
ws.on('message', function(data, flags) {
  // flags.binary will be set if a binary data is received
  // flags.masked will be set if the data was masked
    processBuffer(data);
});

ws.on('close', function () {
  exitProcess('ALL FAILED', -1);
  process.exit(exitCode);
});

function runTests() {
  ws.send('T\t'+ARGV.join('\t'));
}

function exitProcess(key, code) {
  if (timer) {
    clearTimeout(timer);
    sendResults();
  }
  if (code) exitCode = code;
  write(['exit', key, (Date.now() - runTime) + ' ' + code]);
  if (--sessionCount) return;
  process.exit(exitCode);
}

function log(key, msg) {
  write(['log', key, msg]);
}

var lastMsg;

function write(args) {
  switch (args[0]) {
  case 'exit':
    process.stdout.write("\n" + args.join(" ") + ' - ' +
                         (args[args.length-1].match(/0$/) ? 'SUCCESS\n' : 'FAILURE\n'));
    break;
  case 'result':
    process.stdout.write("\r" + args.slice(1).join(" "));
    break;
  default:
    if (lastMsg === 'result')
      process.stdout.write("\n");
    process.stdout.write(args.join(" ")+"\n");
  }
  lastMsg = args[0];
}

var recvdResult, result = {}, timer;

function sendResults() {
  timer = null;
  var msg = ['result'];
  for(var key in result) {
    msg.push(key);
    msg.push(result[key]);
  }
  write(msg);
}

function addResult(key, value) {
  recvdResult = true;
  result[key] = value.split("\x00")[1];

  if (! timer)
    timer = setTimeout(sendResults, 100);
  return;

}

var EXECUTED_RE = /<(.*)> Executed (.*)(?:\n|$)/g;

function processBuffer(buffer) {
  var data = buffer.slice(1).toString();
  var idx = data.indexOf('\x00');
  if (idx !== -1) {
    var key = data.slice(0,idx);
    data = data.slice(idx+1);
  }
  switch(buffer.slice(0,1).toString()) {
  case 'X':
    console.log('test runner: ' + data);
    runTime = Date.now();
    break;
  case 'F': // Finish
    if (recvdResult)
      exitProcess(key, +data);
    else
      exitProcess('No TESTS RUN', 1);
    break;
  case 'L': // Log
    log(key, data);
    break;
  case 'R': // Result
    addResult(key, data);
    break;
  case 'E':
    write(['error', key, data]);
    break;
  }
}
