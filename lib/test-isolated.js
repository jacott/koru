const {spawn} = require('child_process');

module.exports = (client, server, port, args)=>{
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
    const cmdargs = [
      '--disable-translate', '--disable-extensions',
//      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-background-networking', '--safebrowsing-disable-auto-update',
      '--disable-sync', '--metrics-recording-only', '--disable-default-apps',
      '--incognito',
      '--mute-audio', '--no-first-run',
      `--window-size=${process.env.KORU_WINDOW_SIZE||"1220,840"}`,
      '--remote-debugging-port=46085',
    ];
    if (! process.env.KORU_NO_HEADLESS) cmdargs.push('--headless');
    cmdargs.push(`http://localhost:${port}/`);
    browserProc = spawn(process.env.KORU_BROWSER || 'google-chrome', cmdargs);

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
