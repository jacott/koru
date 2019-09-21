module.exports = (client, server, port, args)=>{
  const both = (server && client) || ! (server || client);

  process.chdir(__dirname + "/..");
  console.log(`Entering directory '${process.cwd()}/app'`);

  const net = require('net'),
        fs = require('fs');

  const WebSocket = require('ws');

  const ARGV = [
    (both && 'both') || (client && 'client') || 'server',
    args.join(' '),
    both || client ? 1 : 0
  ];

  let runTime, lastMsg, exitCode = 0;
  let sessionCount = both ? 2 : 1;

  const result = {};
  let recvdResult, timer;

  const runTests = ()=>{
    ws.send('T\t'+ARGV.join('\t'));
  };

  const exitProcess = (key, code)=>{
    if (timer) {
      clearTimeout(timer);
      sendResults();
    }
    if (code) exitCode = code;
    const data = result[key] && result[key].split(' ');
    const time = Date.now() - runTime;
    const info = data === undefined
          ? '' : `, Tests: ${data[1]} (${Math.round(1000*data[1]/time)} tests/s)`;
    write([`\n${code == 0 ? "SUCCESS ✔️ " : "FAILED ❌ "} ${key}.  Time: ${time}ms${info}`]);
    delete result[key];
    if (--sessionCount) return;
    process.exit(exitCode);
  };

  const log = (key, msg)=>{
    write(['log', key, msg]);
  };

  const write = (args)=>{
    switch (args[0]) {
    case 'result':
      process.stdout.write("\r" + args.slice(1).join(" "));
      break;
    default:
      if (lastMsg === 'result')
        process.stdout.write("\n");
      process.stdout.write(args.join(" ")+"\n");
    }
    lastMsg = args[0];
  };

  const sendResults = ()=>{
    timer = null;
    const msg = ['result'];
    for(const key in result) {
      msg.push(key);
      msg.push(result[key]);
    }
    write(msg);
  };

  const addResult = (key, value)=>{
    recvdResult = true;
    result[key] = value.split("\x00")[1];

    if (! timer)
      timer = setTimeout(sendResults, 100);
    return;

  };

  const processBuffer = (buffer)=>{
    let data = buffer.slice(1).toString();
    const idx = data.indexOf('\x00');
    let key;
    if (idx !== -1) {
      key = data.slice(0,idx);
      data = data.slice(idx+1);
    }
    switch(buffer.slice(0,1).toString()) {
    case 'X':
      console.log('test runner: ' + data);
      runTime = Date.now();
      break;
    case 'F': // Finish
      if (recvdResult)
        exitProcess(key, +data);
      else
        exitProcess('No TESTS RUN', 1);
      break;
    case 'L': // Log
      log(key, data);
      break;
    case 'R': // Result
      addResult(key, data);
      break;
    case 'E':
      write(['error', key, data]);
      break;
    }
  };

  const ws = new WebSocket(`ws://localhost:${port}/rc`);
  ws.on('open', runTests);
  ws.on('message', (data, flags)=>{
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    processBuffer(data);
  });

  ws.on('error', err=>{
    console.log('Websocket error: ', err);
    exitProcess('ALL FAILED', -1);
    process.exit(exitCode);
  });

  ws.on('close', ()=>{
    exitProcess('ALL FAILED', -1);
    process.exit(exitCode);
  });
};

if (__filename === process.argv[1]) {
  const {argv} = process;
  module.exports(argv[2] === 'true', argv[3] === 'true', argv[4], argv.slice(5));
}
