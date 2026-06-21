define((require, exports, module) => {
  'use strict';
  const {decodeBinary, decodeText} = require('koru/pg/pg-type');
  const {forEachColumn, buildNameOidColumns} = require('koru/pg/pg-util');
  const TH              = require('koru/test-helper');
  const net             = requirejs.nodeRequire('node:net');

  const doQuery = async (query, maxRows = 0, field, callback) => {
    let columns, tag;
    query.describe((rawColumns) => {
      columns = buildNameOidColumns(rawColumns);
    });
    query.commandComplete((t) => {
      tag = t;
    });
    do {
      await query.fetch(async (rawRow) => {
        const rec = {};
        forEachColumn(rawRow, (rawValue, i) => {
          const {name, format, oid} = columns[i];

          rec[field == null ? `${i}:${name},${oid}` : columns[i][field]] = rawValue &&
            (format == 0 ? decodeText(oid, rawValue) : decodeBinary(oid, rawValue));
        });
        await callback(rec);
      }, maxRows);
    } while (query.isMore);

    refute(query.error);

    return {rows: undefined, columns, tag};
  };

  return {
    createReadySocket: (path, conn) =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection(path, () => resolve(socket));
        socket.on('error', (err) => {
          conn?.close();
        });
      }),

    runQuery: async (query, maxRows, field, callback) => {
      if (callback === undefined) {
        const rows = [];
        const ans = await doQuery(query, maxRows, field, (row) => {
          rows.push(row);
        });
        ans.rows = rows;
        return ans;
      } else {
        return doQuery(query, maxRows, field, callback);
      }
    },

    simpleExec: async (conn, str) => {
      let comp;
      const q = conn.exec(str);
      q.commandComplete((t) => {
        comp = t;
      });
      await q.fetch();
      return comp;
    },
  };
});
