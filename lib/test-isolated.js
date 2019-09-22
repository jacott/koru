const {spawn} = require('child_process');

module.exports = (client, server, port, configProg, args)=>{
  const config = {
    browserArgs: [
      '--disable-translate', '--disable-extensions',
      //      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-background-networking', '--safebrowsing-disable-auto-update',
      '--disable-sync', '--metrics-recording-only', '--disable-default-apps',
      '--incognito', '--headless',
      '--mute-audio', '--no-first-run',
      '--window-size=1220,840',
      `--remote-debugging-port=${process.env.KORU_BROWSER_DEBUGGING_PORT||9222}`,
    ],
  };
  config.browserArgs.push(`http://localhost:${port}/`);

  if (configProg === 'help') {
    let ans = '', line = '';
    const sep = '\n   ';

    console.log(`Config help for running tests

The config filename points to a javascript module which will be loaded and
called with one argument 'config'. Example module:

  module.exports = config =>{
     config.browserArgs = config.browserArgs.filter(o => o !== '--headless');
  };

The 'config' argument contains the following mutable properties:`);
    console.log(config);
    return;
  } else if (configProg !== void 0) {
    require(configProg[0] === '/' ? configProg : process.cwd()+'/'+configProg)(config);
  }

  const both = (server && client) || ! (server || client);
  process.env.KORU_PORT = port;

  let browserProc, testProc, serverProc;

  let running = true;

  const shutdown = (name, code)=>{
    if (name !== undefined) {
      console.log(name + (code ? ' exited with code '+code : ' finished'));
    }
    if (! running) return;
    running = false;
    browserProc && browserProc.kill();
    testProc && testProc.kill();
    serverProc && serverProc.kill();
  };

  const error = (err)=>{
    shutdown();
    throw err;
  };

  const ready = ()=>{
    (client || both) && startBrowser();
    startTest();
  };

  const startBrowser = ()=>{
    browserProc = spawn(process.env.KORU_BROWSER || 'google-chrome', config.browserArgs);

    browserProc.stdout.on('data', (data) => {
      console.log(`browser: ${data}`);
    });

    browserProc.stderr.on('data', (data) => {
      console.log(`browser: ${data}`);
    });

    browserProc.on('error', (err) => {browserProc = undefined; error(err)});

    browserProc.on('exit', (code) => {
      browserProc = undefined;
      shutdown('browser', code);
    });
  };

  const startTest = ()=>{
    testProc = spawn(process.execPath, [__dirname + '/test-runner.js', client, server, port, ...args]);

    testProc.stdout.pipe(process.stdout, {end: false});

    testProc.stderr.on('data', (data) => {
      console.log(`test: ${data}`);
    });

    testProc.on('error', (err) => {testProc = undefined; error(err)});

    testProc.on('exit', (code) => {
      testProc = undefined;
      shutdown('test', code);
    });
  };

  serverProc = spawn('./scripts/start-dev', ['test']);

  serverProc.stdout.on('data', (data) => {
    if (/=> Ready/.test(data.toString()))
      ready();
    console.log(`server: ${data}`);
  });

  serverProc.stderr.on('data', (data) => {
    console.log(`server err: ${data}`);
  });

  serverProc.on('error', (err) => {serverProc = undefined; error(err)});

  serverProc.on('exit', (code) => {
    serverProc = undefined;
    shutdown('server', code);
  });

};
