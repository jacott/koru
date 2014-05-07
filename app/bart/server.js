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
      session.unload('cmd');
      session.sendAll('L', 'cmd');
      break;
    }
    rl.prompt();
  }).on('close', function() {
    console.log('Exiting...');
    process.exit(0);
  });
}
