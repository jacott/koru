module.exports = (options, command) => {
  const {client=false, server=false,
         isolated=false,
         config,
         port=process.env.KORU_PORT|| (isolated ? 3001 : 3000)} = options;

  if (! isolated) {
    return require('./test-runner')(client, server, port, command.args);
  } else {
    return require('./test-isolated')(client, server, port, config, command.args);
  }
};
