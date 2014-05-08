process.chdir(__dirname + "/..");

var net = require('net'),
    fs = require('fs');

var ARGV = process.argv.slice(2);

if (ARGV[0] === 'emacs') {
  ARGV.shift();
  var log = logEmacs;
  var write = writeEmacs;
} else {
  var log = logTty;
  var write = writeTty;
}

var runTime = Date.now();

var exitCount = 0;
var exitCode = 0;

var WebSocket = require('ws');

var ws = new WebSocket('ws://localhost:3000/');
ws.on('open', runTests);
ws.on('message', function(data, flags) {
  // flags.binary will be set if a binary data is received
  // flags.masked will be set if the data was masked
    processBuffer(data);
});

ws.on('close', function () {
  exitProcess(1);
});

function runTests() {
  ws.send('T\t'+ARGV.join('\t'));
}

function exitProcess(key, code) {
  if (code) exitCode = code;
  ++exitCount;
  if (Object.keys(result).length === exitCount) {
    if (timer) {
      clearTimeout(timer);
      sendResults();
    }
    exitCount = 0;
  }
  write(['exit', key, (Date.now() - runTime) + ' ' + code]);
  exitCount || process.exit(code);
}

function logEmacs(key, msg) {
  msg = msg && msg.trim();
  msg.length &&  write(['log', key, msg]);
}

function logTty(key, msg) {
  write(['log', key, msg]);
}

function logError(key, msg) {
  write(['error',key, msg]);
}

function writeEmacs(args) {
  process.stdout.write(args.join('\0') + '\0\0e\n');
}

function writeTty(args) {
  process.stdout.write(args.slice(1).join(" "));
}

var result = {}, timer;

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
  case 'F': // Finish
    exitProcess(key, +data);
    break;
  case 'L': // Log
    log(key, data);
    break;
  case 'R': // Result
    addResult(key, data);
    break;
  case 'E':
    logError(key, data);
    break;
  }
}
