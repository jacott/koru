define((require, exports, module) => {
  'use strict';
  const {decodeBinary, decodeText} = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test-helper');
  const net             = requirejs.nodeRequire('node:net');

  return {
    createReadySocket: (path, conn) => new Promise((resolve, reject) => {
      const socket = net.createConnection(path, () => resolve(socket));
      socket.on('error', (err) => {conn?.close(); new TH.Core.AssertionError(err)});
    }),

    readResult: async (query, maxRows=0, field) => {
      const result = [];
      let columns;
      do {
        await query.fetch((rawRow) => {
          columns ??= buildNameOidColumns(query.rawColumns);
          const rec = {};
          forEachColumn(rawRow, (rawValue, i) => {
            const {name, format, oid} = columns[i];

            rec[field === void 0 ? `${i}:${name},${oid}` : columns[i][field]] = rawValue && (
              format == 0
                ? decodeText(oid, rawValue)
                : decodeBinary(oid, rawValue));
          });
          result.push(rec);
        }, maxRows);
      } while (query.isExecuting);

      return result;
    },
  };
});
