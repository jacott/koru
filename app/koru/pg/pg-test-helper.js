define((require, exports, module) => {
  'use strict';
  const {decodeBinary, decodeText} = require('koru/pg/pg-type');
  const TH              = require('koru/test-helper');
  const net             = requirejs.nodeRequire('node:net');

  return {
    createReadySocket: (path, conn) => new Promise((resolve, reject) => {
      const socket = net.createConnection(path, () => resolve(socket));
      socket.on('error', (err) => {conn?.close(); new TH.Core.AssertionError(err)});
    }),

    readResult: async (query, maxRows=0) => {
      const result = [];
      do {
        await query.fetch((row) => {
          const rec = {};
          for (const {desc, rawValue} of row) {
            rec[`${desc.index}:${desc.name},${desc.oid}`] =
              rawValue && (
                desc.format == 0
                  ? decodeText(desc.oid, rawValue)
                  : decodeBinary(desc.oid, rawValue));
          }
          result.push(rec);
        }, maxRows);
      } while (query.isExecuting);

      return result;
    },
  };
});
