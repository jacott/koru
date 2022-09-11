const net = require('node:net');
const {URL} = require('node:url');

define((require, exports, module) => {
  'use strict';
  const PgError         = require('koru/pg/pg-error');
  const PgProtocol      = require('koru/pg/pg-protocol');
  const {forEachColumn, buildNameOidColumns, tagToCount} = require('koru/pg/pg-util');

  const INVALID_CONNECTION_STRING = {
    severity: 'FATAL',
    message: 'Invalid connection string',
  };

  const findStrEnd = (str, delim, pos) => {
    for (let i = pos; i < str.length; ++i) {
      const c = str[i];
      if (c === '\\') {++i} else if (c === delim) {
        return i;
      }
    }
    return -1;
  };

  const splitToNameValue = (str, nv={}, pos=0) => {
    while (pos < str.length) {
      let ei = str.indexOf('=', pos);
      if (ei == -1) return;
      const name = str.slice(pos, ei);
      pos = ei + 1;
      if (pos >= str.length) return;
      const delim = str[pos];
      if (delim === "'" || delim === '"') {
        pos += 1;
        ei = findStrEnd(str, delim, pos);
        if (ei == -1) return;
        nv[name] = str.slice(pos, ei);
        ei = str.indexOf(' ', ei + 1);
        if (ei == -1) break;
      } else {
        ei = str.indexOf(' ', ei);
        if (ei == -1) ei = str.length;
        nv[name] = str.slice(pos, ei);
      }
      pos = ei + 1;
    }

    return nv;
  };

  const parseUrlOptions = (str) => {
    const url = new URL(str);

    const options = {};

    if (url.host !== '') options.host = url.host;
    if (url.port !== '') options.port = url.port;
    if (url.username !== '') options.user = url.username;
    if (url.password !== '') options.password = url.password;
    const dbname = url.pathname.slice(1);
    if (dbname !== '') options.dbname = dbname;

    for (const [name, value] of url.searchParams.entries()) options[name] = value;

    return options;
  };

  const parseOptions = (str) => {
    if (str.length === 0) return {};
    if (/^postgresq?l?:\/\//.test(str)) return parseUrlOptions(str);
    const options = splitToNameValue(str);
    if (options === undefined) throw new PgError(INVALID_CONNECTION_STRING);
    return options;
  };

  const SOCKET_OPTONS = {
    host: 'host', port: 'port', keepalives: 'keepAlive',
  };

  const FILTERED_OPTIONS = {
    ...SOCKET_OPTONS,
    dbname: true, options: true,
    password: true,
  };

  const FALSEY = {false: true, 0: true, f: true};

  class PgConn {
    constructor(types, formatOptions={}) {
      this.types = types;
      this.formatOptions = formatOptions;
    }

    connect(options, callback) {
      const client = new PgClient(this.types, this.formatOptions);
      if (typeof options === 'string') options = parseOptions(options);
      const connOpts = {};
      connOpts.user = options.user ?? process.env.USER;
      if (options.dbname !== undefined) connOpts.database = options.dbname;
      if (options.options !== undefined) connOpts.options = options.options;
      const {password} = options;
      for (const name in options) {
        if (FILTERED_OPTIONS[name] === undefined) connOpts[name] = options[name];
      }
      let socket;
      const host = options.host ?? '/var/run/postgresql';
      if (host.indexOf('/') !== -1) {
        socket = net.createConnection(host + '/.s.PGSQL.' + (options.port ?? '5432'));
      } else {
        const socketOpts = {port: 5432};
        for (const name in options) {
          const sn = SOCKET_OPTONS[name];
          if (sn !== undefined) socketOpts[sn] = options[name];
        }
        const {keepAlive} = socketOpts;
        if (typeof keepAlive === 'number') {
          socketOpts.keepAlive = !! keepAlive;
        } else if (typeof keepAlive === 'string') {
          socketOpts.keepAlive = ! FALSEY[keepAlive];
        }
        socket = net.createConnection(socketOpts);
      }
      if (socket === undefined) throw new Error('Invalid connection argument');

      const p = new Promise((resolve, reject) => {
        socket.once('connect', () => {
          new PgProtocol(connOpts).connect(socket, password).then((conn) => {
            client.conn = conn;
            resolve(client);
          }, (err) => {
            socket.destroy();
            reject(err);
          });
        });

        socket.on('error', (err) => {
          const sql = {severity: 'FATAL', message: err.toString()};
          if (client.conn === undefined) {
            reject(sql);
          } else {
            socket.destroy();
            client.conn.close();
            client.error = sql;
          }
        });
      });

      if (callback === undefined) return p.catch(async (err) => {
        if (err instanceof Error) throw err;
        throw new PgError(err);
      });

      p.then(
        () => {callback(null, client)},
        (err) => {
          callback(err instanceof Error ? err : new PgError(err));
        },
      );

      return client;
    }
  }

  const execParams = (client, name, queryStr, paramValues, paramOids, resultFormatCodes) => {
    const {types: {encodeBinary, guessOid}} = client;

    const port = client.conn.portal();
    const oidCount = paramOids?.length ?? 0;
    port.parse(name, queryStr, paramValues.length);
    const b = port.prepareValues();
    let i = -1;
    for (const value of paramValues) {
      const oid = (++i < oidCount ? paramOids[i] ?? 0 : 0);
      port.addParamOid(encodeBinary(b, value, oid == 0 ? guessOid(value) : oid));
    }
    port.addResultFormat(resultFormatCodes);
    port.describe();
    return port;
  };

  const ROW_RETURNING = {S: true, F: true};
  const isRowReturningTag = (tag) => ROW_RETURNING[tag[0]] ?? false;

  class PgClient {
    constructor(types, formatOptions={}) {
      this.types = types;
      this.formatOptions = formatOptions;
    }

    destroy() {
      this.conn.close();
      this.conn.socket.destroy();
    }

    isClosed() {return this.conn.isClosed()}

    buildGetValue() {
      const {types: {decodeText, decodeBinary}} = this;

      return (desc, rawValue) => {
        if (rawValue == null) return null;
        const value = desc.format == 1
              ? decodeBinary(desc.oid, rawValue)
              : decodeText(desc.oid, rawValue);
        if (value === undefined && desc.oid !== 2278) {
          throw {message: `unknown oid ${desc.oid} for column: ${desc.name}`};
        }
        return value;
      };
    }

    buildForEach(query, queryString, paramValues) {
      let completed;
      return {
        fetch: async (callback) => {
          const {excludeNulls=true} = this.formatOptions;
          const getValue = this.buildGetValue();
          try {
            do {
              let columns;
              query.describe((rawColumns) => {columns = buildNameOidColumns(rawColumns)});
              await query.fetch((rawRow) => {
                const rec = {};
                forEachColumn(rawRow, (rawValue, i) => {
                  const desc = columns[i];
                  const value = getValue(desc, rawValue);
                  if (! excludeNulls || value !== null) {
                    rec[desc.name] = value;
                  }
                });
                callback(rec);
              });
              if (query.error !== undefined) throw query.error;
            } while (query.isExecuting)
          } catch (err) {
            err = await query.close(err);
            throw (err instanceof Error) ? err : new PgError(err, queryString, paramValues);
          }
        },
        get isExecuting() {return query.isExecuting},
        commandComplete: (callback) => query.commandComplete(callback),
      };
    }

    async fetchRows(query, maxRows) {
      try {
        const result = [];
        let ans, tag;
        do {
          query.commandComplete((t) => {tag = t});
          await query.fetch((row) => {result.push(row)}, maxRows);
          if (query.error) throw query.error;
        } while (query.isExecuting)
        return result.length != 0 || isRowReturningTag(tag) ? result : tagToCount(tag);
      } catch (err) {
        if (err instanceof Error) throw err;
        throw new PgError(err);
      }
    }

    execRows(queryString, paramValues, paramOids, resultFormatCodes) {
      return this.buildForEach(
        paramValues === undefined
          ? this.conn.exec(queryString)
          : execParams(this, '', queryString, paramValues, paramOids, resultFormatCodes),
        queryString, paramValues,
      );
    }

    async exec(queryString, paramValues, paramOids, resultFormatCodes) {
      return this.fetchRows(this.execRows(queryString, paramValues, paramOids, resultFormatCodes));
    }
  }

  return PgConn;
});
