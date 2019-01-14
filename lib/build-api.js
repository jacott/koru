const {spawn} = require('child_process');

let browser, test, server;

let running = true;

const shutdown = (name, code)=>{
  if (name !== undefined) {
    console.log(name + (code ? ' exited with code '+code : ' finished'));
  }
  if (! running) return;
  running = false;
  browser && browser.kill();
  test && test.kill();
  server && server.kill();
};

const error = (err)=>{
  shutdown();
  throw err;
};

const ready = ()=>{
  startBrowser();
  startTest();
};

const startBrowser = ()=>{
  browser = spawn(process.env.KORU_BROWSER || 'google-chrome', [
    '--disable-translate', '--disable-extensions',
    '--no-sandbox',
    '--disable-background-networking', '--safebrowsing-disable-auto-update',
    '--disable-sync', '--metrics-recording-only', '--disable-default-apps',
    '--mute-audio', '--no-first-run',
    '--remote-debugging-port=46085',
    '--disable-setuid-sandbox', '--headless',
    `http://localhost:${process.env.KORU_PORT||3000}/`
  ]);

  browser.stdout.on('data', (data) => {
    console.log(`browser: ${data}`);
  });

  browser.stderr.on('data', (data) => {
    console.log(`browser: ${data}`);
  });

  browser.on('error', (err) => {browser = undefined; error(err)});

  browser.on('exit', (code) => {
    browser = undefined;
    shutdown('browser', code);
  });
};

const startTest = ()=>{
  test = spawn('./bin/koru', ['test', ...process.argv.slice(2)]);

  test.stdout.pipe(process.stdout, {end: false});

  test.stderr.on('data', (data) => {
    console.log(`test: ${data}`);
  });

  test.on('error', (err) => {test = undefined; error(err)});

  test.on('exit', (code) => {
    test = undefined;
    shutdown('test', code);
  });
};

server = spawn('./scripts/start-dev', ['test']);

server.stdout.on('data', (data) => {
  if (/=> Ready/.test(data.toString()))
    ready();
  console.log(`server: ${data}`);
});

server.stderr.on('data', (data) => {
  console.log(`server err: ${data}`);
});

server.on('error', (err) => {server = undefined; error(err)});

server.on('exit', (code) => {
  server = undefined;
  shutdown('server', code);
});
