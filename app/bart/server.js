define(function (require, exports, module) {
  var webserver = require('bart-webserver/server');
  var session = require('bart-session/server');

  cli(session);
});

function cli(session) {
  var readline = require('readline');
  var rl = readline.createInterface(process.stdin, process.stdout);

  rl.setPrompt('BART> ');
  rl.prompt();

  rl.on('line', function(line) {
    var m = /^(\w+)\s+(.*)$/.exec(line);
    if (m) switch(m[1].toLowerCase()) {
    case 'load':
      console.log('loading ', m[2]);
      session.sendAll('L', m[2]);
      break;
    default:
      console.log('Say what? I might have heard `' + line.trim() + '`');
      break;
    }
    rl.prompt();
  }).on('close', function() {
    console.log('Exiting...');
    process.exit(0);
  });
}
