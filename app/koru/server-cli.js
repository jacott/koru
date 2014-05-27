define(['./env', 'module', 'koru/session/server-main'], function (env, module, session) {
  var readline = require('readline');
  var rl = readline.createInterface(process.stdin, process.stdout);

  env.onunload(module, function () {
    readline = null;
    rl.close();
    require([module.id], function () {});
  });

  rl.setPrompt('BART> ');
  rl.prompt();

  rl.on('line', function(line) {
    var m = /^(\w+)\s+(.*)$/.exec(line) || [line, line];
    if (line) switch(m[1].toLowerCase()) {
    case 'run':
      session.unload('cmd');
      session.sendAll('L', 'cmd');
      break;
    case 'srun':
      session.unload('server-cmd');
      require(['server-cmd'], function () {});
      break;
    }
    rl.prompt();
  }).on('close', function() {
    if (readline) process.exit(0);
  });
});
