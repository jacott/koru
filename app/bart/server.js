define(function (require, exports, module) {
  var webserver = require('bart/web-server');
  var session = require('bart/session-server');

  cli(session);
});

function cli(session) {
  var readline = require('readline');
  var rl = readline.createInterface(process.stdin, process.stdout);

  rl.setPrompt('BART> ');
  rl.prompt();

  rl.on('line', function(line) {
    var m = /^(\w+)\s+(.*)$/.exec(line) || [line, line];
    if (line) switch(m[1].toLowerCase()) {
    case 'run':
      session.sendAll('R', 'cmd');
      break;
    case 'u':
      console.log('unloading '+ m[2]);
      session.sendAll('U', m[2]);
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
