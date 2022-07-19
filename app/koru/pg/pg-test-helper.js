define((require, exports, module) => {
  'use strict';
  const {decodeBinary, decodeText} = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test-helper');
  const net             = requirejs.nodeRequire('node:net');

  const doQuery = async (query, maxRows=0, field) => {
    const result = [];
    let columns;
    query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
    do {
      await query.fetch((rawRow) => {
        const rec = {};
        forEachColumn(rawRow, (rawValue, i) => {
          const {name, format, oid} = columns[i];

          rec[field == null ? `${i}:${name},${oid}` : columns[i][field]] = rawValue && (
            format == 0
              ? decodeText(oid, rawValue)
              : decodeBinary(oid, rawValue));
        });
        result.push(rec);
      }, maxRows);
    } while (query.isExecuting);

    return {result, columns};
  };

  return {
    createReadySocket: (path, conn) => new Promise((resolve, reject) => {
      const socket = net.createConnection(path, () => resolve(socket));
      socket.on('error', (err) => {conn?.close(); new TH.Core.AssertionError(err)});
    }),

    runQuery: (query, maxRows, field='name') => doQuery(query, maxRows, field),

    readResult: async (query, maxRows, field) => (await doQuery(query, maxRows, field)).result,
  };
});
