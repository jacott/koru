define(['./main', 'module', 'koru/session/base'], (koru, module, session)=>{
  const readline = require('readline');
  const rl = readline.createInterface(process.stdin, process.stdout);

  koru.onunload(module, ()=>{
    readline = null;
    rl.close();
    require([module.id], ()=>{});
  });

  rl.setPrompt('BART> ');
  rl.prompt();

  rl.on('line', line =>{
    if (line) {
      const m = /^(\w+)\s+(.*)$/.exec(line) || [line, line];
      switch(m[1].toLowerCase()) {
      case 'run':
        session.unload('cmd');
        session.sendAll('L', 'cmd');
        break;
      case 'srun':
        break;
      }
    }
    rl.prompt();
  }).on('close', ()=>{if (readline) process.exit(0)});
});
