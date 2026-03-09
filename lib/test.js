module.exports = (testModule, testPrefix, options, command) => {
  const {
    client = false,
    server = false,
    isolated = false,
    config,
    port = process.env.KORU_PORT || (isolated ? 3001 : 3000),
  } = options;

  const args = [];
  if (testModule != null) {
    args.push(testModule);
    if (testPrefix != null) {
      args.push(testPrefix);
    }
  }

  if (!isolated) {
    return require('./test-runner')(client, server, port, args);
  } else {
    return require('./test-isolated')(client, server, port, config, args);
  }
};
