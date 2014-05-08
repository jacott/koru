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
  write(['exit', code, " elapsed time: " + (Date.now() - runTime) + "ms.\n"]);
  ++exitCount;
  if (Object.keys(result).length === exitCount)
    process.exit(code);
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
  process.stdout.write(args.join('\0') + '\0\0e');
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

  result[key] = value;

  if (! timer)
    timer = setTimeout(sendResults, 100);
  return;

}

var EXECUTED_RE = /(.*): Executed (.*)(?:\n|$)/g;

function processBuffer(buffer) {
  var data = buffer.slice(1).toString();
  var idx = data.indexOf(':');
  if (idx !== -1) {
    var key = data.slice(0,idx);
    data = data.slice(idx+1);
  }
  switch(buffer.slice(0,1).toString()) {
  case 'E': // Exit
    exitProcess(key, +data);
    break;
  case 'L': // Log
    log(key, data);
    break;
  case 'R': // Result
    data = data.replace(EXECUTED_RE, function (_, m1, m2) {
      var match = /(\d+) of (\d+) *(?:\((\d+) FAILED\))? *(?:\(skipped (\d+)\))?/.exec(m2);
      if (! match) {
        log(m1 + ": Executed " + m2);
      } else {
        match = match.slice(1,5);
        for(var i=0;i < match.length;++i) {
          if (match[i] == null)
            match[i] = 0;
        }

        while (match.length < 4) match.push(0);
        addResult(key, m1, "(" + match.join(" ") + ")");
        return '';
      }
    });
    data && logError(key, data);
    break;
  }
}
