module.exports = (...args)=>{
  const {client=false, server=false,
         isolated=false,
         port=process.env.KORU_PORT|| (isolated ? 3001 : 3000)} = args.pop();

  if (! isolated) {
    return require('./test-runner')(client, server, port, args);
  } else {
    return require('./test-isolated')(client, server, port, args);
  }
};
