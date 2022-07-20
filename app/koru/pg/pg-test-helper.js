define((require, exports, module) => {
  'use strict';
  const {decodeBinary, decodeText} = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test-helper');
  const net             = requirejs.nodeRequire('node:net');

  const doQuery = async (query, maxRows=0, field) => {
    const rows = [];
    let columns, tag;
    query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
    query.commandComplete((t) => {tag = t});
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
        rows.push(rec);
      }, maxRows);
    } while (query.isExecuting);

    return {rows, columns, tag};
  };

  return {
    createReadySocket: (path, conn) => new Promise((resolve, reject) => {
      const socket = net.createConnection(path, () => resolve(socket));
      socket.on('error', (err) => {conn?.close(); new TH.Core.AssertionError(err)});
    }),

    runQuery: (query, maxRows, field) => doQuery(query, maxRows, field),
  };
});
