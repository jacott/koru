define((require, exports, module) => {
  'use strict';
  const Enumerable      = require('koru/enumerable');
  const Future          = require('koru/future');
  const Observable      = require('koru/observable');
  const PgConn          = require('koru/pg/pg-conn');
  const PgType          = require('koru/pg/pg-type');
  const SQLStatement    = require('koru/pg/sql-statement');
  const SimpleMutex     = require('koru/util/simple-mutex');
  const PgPrepSql       = require('./pg-prep-sql');
  const koru            = require('../main');
  const match           = require('../match');
  const Pool            = require('../pool-server');
  const util            = require('../util');

  const {private$, inspect$} = require('koru/symbols');

  const {escapeLiteral} = PgType;

  const JSON_OIDS = [];
  JSON_OIDS[114] = true;
  JSON_OIDS[3802] = true;

  const UNKNOWN_COLUMN = {name: '', oid: 0, arraydim: 0, order: -1, isJson: false};

  const OPS = {
    $gt: '>',
    '>': '>',
    $gte: '>=',
    '>=': '>=',
    $lt: '<',
    '<': '<',
    $lte: '<=',
    '<=': '<=',
  };

  const pool$ = Symbol(), mutex$ = Symbol(), count$ = Symbol(), oidsLoaded$ = Symbol(), tx$ = Symbol();
  const {hasOwn} = util;

  let clientCount = 0;
  let cursorCount = 0;

  const autoSchema = !! module.config().autoSchema;

  let defaultDb = null;

  const regexToText = (re) => {
    const text = re.toString();
    const idx = text.lastIndexOf('/');
    return [text.slice(1, idx - 1), text.slice(idx + 1)];
  };

  const closeDefaultDb = () => {
    defaultDb?.end();
    defaultDb = null;
  };

  const getTransction = (client) => util.thread[client[tx$]] ??= new Transaction();

  const acquireConn = async (client) => {
    const conn = await fetchPool(client).acquire();
    conn[count$] = 0;
    const tx = getTransction(client);
    assert(tx.actualSavepoint == -1);
    if (tx.actualSavepoint < tx.savepoint) {
      ++conn[count$];
      let str = '';
      if (tx.actualSavepoint == -1) {
        str = 'BEGIN';
        tx.actualSavepoint = 0;
      }
      while (tx.actualSavepoint < tx.savepoint) {
        str += ';SAVEPOINT s' + ++tx.actualSavepoint;
      }
      await conn.exec(str);
    }
    return conn;
  };

  const getConn = async (client) => {
    await client[mutex$].lock();
    try {
      const conn = getTransction(client).conn ??= await acquireConn(client);
      ++conn[count$];
      return conn;
    } finally {
      client[mutex$].unlock();
    }
  };

  const releaseConn = (client) => {
    const tx = getTransction(client);
    if (tx.conn === undefined) return;
    if (--tx.conn[count$] === 0) {
      fetchPool(client).release(tx.conn);
      tx.conn = undefined;
    }
  };

  const fetchPool = (client) => {
    const pool = client[pool$];
    if (pool !== undefined) return pool;
    return client[pool$] = new Pool({
      name: client.name,
      create: (callback) => newConnection(client, callback),
      destroy: (conn) => conn.destroy(),
      idleTimeoutMillis: 30*1000,
    });
  };

  const query = (conn, text, params, paramOids) => conn.exec(text, params, paramOids);

  const ensureColumns = async (table, params, callback) => {
    table._ready !== true && await table._ensureTable();

    const needCols = autoSchema ? checkColumns(table, params) : undefined;
    if (needCols !== undefined && table.schema === undefined) {
      return table._client.transaction(async () => {
        await addColumns(table, needCols);
        return table._client.withConn((conn) => callback(conn));
      });
    } else {
      return table._client.withConn((conn) => callback(conn));
    }
  };

  const selectFields = (table, fields) => {
    if (fields === undefined) return '*';
    let add = false, col;
    const result = ['_id'];
    for (col in fields) {
      if (! add) {
        add = !! fields[col];
      } else if (add !== !! fields[col]) {
        throw new Error('fields must be all true or all false');
      }
      if (col !== '_id' && add) {
        result.push('"' + col + '"');
      }
    }
    if (! add) for (col in table._colMap) {
      if (col === '_id') continue;
      hasOwn(fields, col) || result.push('"' + col + '"');
    }
    return result.join(',');
  };

  const runOnCommit = (onCommit) => {
    while (onCommit !== undefined) {
      const {action} = onCommit;
      onCommit = onCommit.next;
      action();
    }
  };

  const normalizeQuery = (args) => {
    const text = args[0];
    const arg1 = args[1];
    if (typeof text === 'string') {
      if (arg1 === undefined || Array.isArray(arg1)) return args;
      const args2 = args[2] ?? {};
      const posMap = {}, params = [], oids = [];
      let count = 0;
      const ctext = text.replace(/\{\$(\w+)\}/g, (m, key) => posMap[key] ?? (
        params.push(arg1[key]), oids.push(args2[key] ?? 0),
        (posMap[key] = `$${++count}`)));
      return [ctext, params];
    }

    if (text instanceof SQLStatement) {
      const args = text.convertArgs(arg1);
      return [text.text, args];
    }

    if (Array.isArray(text)) {
      let sqlStr = text[0];
      const len = args.length - 1;
      for (let i = 1; i <= len; ++i) {
        sqlStr += '$' + i + text[i];
      }
      return [sqlStr, args.slice(1)];
    }

    return args;
  };

  const oidQuery = (client, sql, values, oids) => client.withConn((conn) => query(conn, sql, values, oids));

  class Client {
    constructor(url, name, formatOptions) {
      this[tx$] = Symbol();
      this._url = url;
      this.name = name;
      this.formatOptions = formatOptions;
      this[mutex$] = new SimpleMutex();
    }

    [inspect$]() {
      return `Pg.Driver("${this.name}")`;
    }

    jsFieldToPg(col, type, conn) {
      return jsFieldToPg(col, type, this);
    }

    async schemaName() {
      if (this._schemaName === undefined) {
        this._schemaName = (await oidQuery(this, 'SELECT current_schema'))[0].current_schema;
      }
      return this._schemaName;
    }

    end() {
      const pool = this[pool$];
      if (pool !== undefined) {
        pool.drain();
      }
      this[pool$] = undefined;
    }

    _getConn() {
      return getConn(this);
    }

    _releaseConn() {
      return releaseConn(this);
    }

    get existingTran() {return getTransction(this)}

    async withConn(callback) {
      const {conn} = getTransction(this);
      if (conn !== undefined) return callback.call(this, conn);
      try {
        return await callback.call(this, await getConn(this));
      } finally {
        releaseConn(this);
      }
    }

    query(...args) {
      return this.withConn((conn) => query(conn, ...normalizeQuery(args)));
    }

    oidQuery(sql, values, oids) {return oidQuery(this, sql, values, oids)}

    async explainQuery(...args) {
      args = normalizeQuery(args);
      args[0] = 'EXPLAIN ANALYZE ' + args[0];
      return (await this.withConn((conn) => query(conn, ...args)))
        .map((d) => d['QUERY PLAN']).join('\n');
    }

    timeLimitQuery(...args) {
      const last = args.at(-1);
      const {timeout=20000, timeoutMessage='Query took too long to run'} = args.pop();
      return this.transaction(async (tx) => {
        try {
          const conn = await getConn(this);
          await conn.exec('set local statement_timeout to ' + timeout);
          args = normalizeQuery(args);
          return await query(conn, ...args);
        } catch (err) {
          if (err.error === 504) {
            throw new koru.Error(504, timeoutMessage);
          }
          throw err;
        } finally {
          releaseConn(this);
        }
      });
    }

    prepare(name, command) {
      return this.withConn((conn) => conn.prepare(name, command));
    }

    execPrepared(name, params) {
      return this.withConn((conn) => conn.execPrepared(name, params));
    }

    table(name, schema) {
      return new Table(name, schema, this);
    }

    dropTable(name) {
      return oidQuery(this, `DROP TABLE IF EXISTS "${name}"`);
    }

    get inTransaction() {return getTransction(this).savepoint != -1}

    startTransaction() {
      const tx = getTransction(this);
      if (++tx.savepoint == 0) {
        tx.transaction = 'COMMIT';
      } else if (tx.actualSavepoint != -1) {
        let str = '';
        while (tx.actualSavepoint < tx.savepoint) {
          str += 'SAVEPOINT s' + ++tx.actualSavepoint + ';';
        }
        return tx.conn.exec(str).then(() => tx);
      }
      return tx;
    }

    async startAutoEndTran() {
      if (this.inTransaction) throw new Error('startAutoEndTran not allowed in existing transaction');
      const tx = this.startTransaction();
      util.thread.finally(() => this.endTransaction());
      tx.conn = await acquireConn(this);
      return tx;
    }

    async endTransaction(abort) {
      const tx = getTransction(this);
      if (tx.savepoint == -1) throw new Error('No transaction in progress!');
      if (tx.savepoint > tx.actualSavepoint) {
        if (--tx.savepoint == -1) {
          tx.transaction = null;
        }
        return tx.savepoint;
      }

      try {
        const isAbort = tx.transaction !== 'COMMIT' || abort === 'abort';
        if (tx.savepoint > 0) {
          if (isAbort) {
            tx.conn.isClosed() || await query(tx.conn, 'ROLLBACK TO SAVEPOINT s' + tx.savepoint);
          } else {
            await tx.conn.exec('RELEASE SAVEPOINT s' + tx.savepoint);
          }
        } else {
          const command = isAbort ? 'ROLLBACK' : 'COMMIT';
          tx.transaction = null;
          if (! tx.conn.isClosed()) {
            await tx.conn.exec(command);
          }
        }
      } finally {
        --tx.savepoint;
        if (--tx.actualSavepoint == -1) {
          releaseConn(this);
        }
      }

      return tx.savepoint;
    }

    async transaction(callback) {
      const tx = await this.startTransaction();
      const {transaction} = tx;
      tx.transaction = 'COMMIT';
      let err;
      try {
        return await callback.call(this, tx);
      } catch (_err) {
        err = _err;
      } finally {
        await this.endTransaction(err && 'abort');
        if (this.inTransaction) {
          tx.transaction = transaction;
        }
        if (err !== 'abort' && err !== undefined) throw err;
      }
    }
  }

  Client.prototype.exec = Client.prototype.query;

  Client.prototype[private$] = {tx$};

  const newConnection = (client, callback) => {
    new PgConn(PgType).connect(client._url, (err, conn) => {
      if (err == null && PgType[oidsLoaded$] === undefined) {
        conn[count$] = 0;
        PgType.assignOids(conn).then(() => {
          callback(err, conn)}, callback);
      } else {
        callback(err, conn);
      }
    });
  };

  class Transaction {
    conn = undefined;
    count = 0;
    actualSavepoint = -1;
    savepoint = -1;
    transaction = null;
  }

  const queryWhere = async (table, sql, where, suffix) => {
    table._ready !== true && await table._ensureTable();

    let values, oids;
    if (where !== undefined) {
      values = [];
      oids = [];
      where = table.where(where, values, oids);
    }
    if (where === undefined) {
      if (suffix) sql += suffix;
    } else {
      sql = sql + ' WHERE ' + where;
      if (suffix) sql += suffix;
    }
    for (let i = oids.length; i < values.length; ++i) {
      oids.push(PgType.guessOid(values[i]));
    }

    return table._client.withConn(
      (conn) => (table._ps_cache.get(sql) ?? addPs(table, new PgPrepSql(sql).setOids(oids)))
        .execute(conn, values));
  };

  const buildUpdate = (table, params, callback) => ensureColumns(table, params, (conn) => {
    let i = 0;
    const sql = `UPDATE "${table._name}" SET ${Enumerable.mapObjectToArray(params, (n) => `"${n}"=$${++i}`).join(',')}`;
    return callback(conn, sql, i);
  });

  const addPs = (table, ps) => (table._ps_cache.set(ps.queryStr, ps), ps);

  class Table {
    #schema = undefined;

    constructor(name, schema, client) {
      this._name = name;
      this.#schema = schema;
      this._client = client;
      this._ready = undefined;
      this._ps_cache = new Map();
      this._ps_findById = undefined;
    }

    [inspect$]() {return `PgTable("${this._name}")`}

    get schema() {
      return this.#schema;
    }

    async updateSchema(schema) {
      this.#schema = schema;
      this._ready !== true && await this._ensureTable();
      if (this._ready) {
        await updateSchema(this, schema);
      }
    }

    _resetTable() {
      this._ps_findById = undefined;
      this._ps_cache = new Map();
      this._ready = undefined;
    }

    withConn(callback) {
      return this._ready ? this._client.withConn(callback) : this._ensureTable()
        .then(() => this._client.withConn(callback));
    }

    readColumns() {return readColumns(this)}

    async _ensureTable() {
      if (this._ready === true) return;

      if (typeof this._ready === 'object') {
        this._ready ??= new Observable();
        const future = new Future();
        const handle = this._ready.add(future.resolve);
        try {
          await future.promise;
        } finally {
          handle.stop();
        }
        return this._ensureTable();
      }

      this._ready = null;

      if (autoSchema) {
        await this.autoCreate();
      } else {
        await readColumns(this);
      }
      const subject = this._ready;
      this._ready = true;
      if (subject !== null) {
        await subject.notify();
      }
    }

    dbType(col) {
      return pgFieldType(this.schema[col]);
    }

    async autoCreate() {
      await readColumns(this);
      const {schema} = this;
      if (this._colMap === undefined) {
        const fields = ['_id text collate "C" PRIMARY KEY'];
        if (schema) {
          for (let col in schema) {
            const spec = jsFieldToPg(col, schema[col], this._client);
            if (col === '_id') {
              fields[0] = spec + ' PRIMARY KEY';
            } else {
              fields.push(spec);
            }
          }
        }

        await oidQuery(this._client, `CREATE TABLE IF NOT EXISTS "${this._name}" (${fields.join(',')})`);
        await readColumns(this);
      } else if (schema) {
        await updateSchema(this, schema);
      }
    }

    transaction(func) {
      return this._client.transaction((tx) => func.call(this, tx));
    }

    insert(params, suffix='') {
      return ensureColumns(
        this, params,
        (conn) => {
          let indexes = '';
          let cols = '';
          const names = Enumerable.mapObjectToArray(params, (n, v, i) => (
            cols += (i == 0 ? '' : ',') + `"${n}"`,
            indexes += `${i == 0 ? '$1' : ',$' + (i + 1)}`,
            n));
          const sql = `INSERT INTO "${this._name}" (${cols}) values (${indexes}) ${suffix}`;
          return (this._ps_cache.get(sql) ?? addPs(this, new PgPrepSql(sql).setMapped(names, this._colMap)))
            .execute(conn, params);
        },
      );
    }

    async ensureIndex(keys, options={}) {
      this._ready !== true && await this._ensureTable();
      let cols = Object.keys(keys);
      const name = this._name + '_' + cols.join('_');
      cols = cols.map((col) => '"' + col + (keys[col] === -1 ? '" DESC' : '"'));
      const unique = options.unique ? 'UNIQUE ' : '';
      return oidQuery(this._client, 'CREATE ' + unique + 'INDEX IF NOT EXISTS "' +
                      name + '" ON "' + this._name + '" (' + cols.join(',') + ')');
    }

    updateById(_id, params) {
      return buildUpdate(this, params, (conn, sql, len) => (
        sql += ` WHERE _id=$${len + 1}`,
        (this._ps_cache.get(sql) ?? addPs(this, new PgPrepSql(sql).setParamMapper(
          len + 1, ([params, _id], callback) => {
            for (const name in params) callback(params[name], this._colMap[name]?.oid);
            callback(_id, 25);
          }))).execute(conn, [params, _id])));
    }

    update(whereParams, params) {
      return buildUpdate(this, params, (conn, sql, len) => {
        const values = [], oids = [];
        const where = this.where(whereParams, values, oids, len);
        if (where !== undefined) sql += ` WHERE ${where}`;

        return (this._ps_cache.get(sql) ?? addPs(this, new PgPrepSql(sql).setParamMapper().setParamMapper(
          len + values.length, ([params, values], callback) => {
            for (const name in params) callback(params[name], this._colMap[name]?.oid);
            let index = len - 1;
            for (const v of values) callback(v, oids[++index]);
          }))).execute(conn, [params, values]);
      });
    }

    async remove(whereParams) {
      this._ready !== true && await this._ensureTable();
      const sql = `DELETE FROM "${this._name}"`;
      const cols = {};
      const whereSql = whereParams && this.where(whereParams, cols.values = [], cols.oids = []);
      return this._client.withConn((conn) => execute(
        conn, whereSql === undefined ? sql : `${sql} WHERE ${whereSql}`, cols));
    }

    where(query, whereValues, whereOids, count=whereValues.length) {
      assert(whereOids !== undefined);
      if (query == null) return;
      if (this._ready !== true) {
        return this._ensureTable().then(() => this.where(query, whereValues, whereOids, count));
      }

      const colMap = this._colMap;
      const whereSql = [];
      let fields;

      const inArray = (colSpec, qkey, result, value, isIn) => {
        let where;
        switch (value ? value.length : 0) {
        case 0:
          result.push(isIn ? 'FALSE' : 'TRUE');
          return;
        case 1:
          whereValues.push(value[0]);
          whereOids.push(colSpec.oid);
          where = qkey + ' IN ($' + ++count + ')';
          break;
        default:
          whereValues.push(value);
          whereOids.push(PgType.toArrayOid(colSpec.oid) ?? 0);
          where = qkey + ' = ANY($' + ++count + ')';
        }
        result.push(isIn ? where : 'NOT (' + where + ')');
      };

      const foundInSql = (value, result) => {
        if (typeof value === 'string') {
          result.push(value);
        } else if (Array.isArray(value[0])) {
          const strings = value[0];
          let sqlStr = strings[0];
          let i = 1;
          for (;i < value.length; ++i) {
            sqlStr += '$' + (++count) + strings[i];
            whereValues.push(value[i]);
            whereOids.push(0);
          }
          result.push(sqlStr);
        } else {
          const items = value[1];
          const paramNos = {};
          if (Array.isArray(items)) {
            result.push(value[0]);
            items.forEach((item) => {
              ++count;
              whereValues.push(item);
              whereOids.push(0);
            });
          } else if (value[0] instanceof SQLStatement) {
            const statment = value[0];
            statment.convertArgs(items, whereValues, whereOids);
            result.push(statment.text);
          } else {
            result.push(value[0].replace(/\{\$([\w]+)\}/g, (m, key) => {
              const tag = paramNos[key];
              if (tag !== undefined) return tag;
              const val = items[key];
              whereValues.push(val);
              const {oid} = colMap[key] ?? UNKNOWN_COLUMN;
              whereOids.push(Array.isArray(val) ? PgType.toArrayOid(oid) ?? 0 : oid);
              return paramNos[key] = '$' + ++count;
            }));
          }
        }
      };

      const foundIn = (fields, result) => {
        let qkey;
        for (let key in fields) {
          const value = fields[key];
          const splitIndex = key.indexOf('.');
          if (splitIndex !== -1) {
            const remKey = key.slice(splitIndex + 1);
            key = key.slice(0, splitIndex);
            qkey = `"${key}"`;
            remKey.split('.').forEach((p) => {qkey += `->'${p}'`});
            if (value == null) {
              result.push(`${qkey}=$${++count}`);
              whereValues.push(null);
              whereOids.push(25);
              continue;
            }
          } else {
            if (key[0] === '$') switch (key) {
              case '$sql':
              foundInSql(value, result);
              continue;
              case '$or':
              case '$and':
              case '$nor':
              const parts = [];
              util.forEach(value, (w) => {
                const q = [];
                foundIn(w, q);
                q.length != 0 && parts.push('(' + q.join(' AND ') + ')');
              });
              result.push('(' + parts.join(key === '$and' ? ' AND ' : ' OR ') + (key === '$nor' ? ') IS NOT TRUE' : ')'));
              continue;
            }
            qkey = `"${key}"`;
            if (value == null) {
              result.push(qkey + ' IS NULL');
              continue;
            }
          }

          const colSpec = colMap[key] ?? UNKNOWN_COLUMN;

          if (value != null) {
            if (colSpec.arraydim != 0) {
              if (typeof value === 'object') {
                if (Array.isArray(value)) {
                  result.push(qkey + ' && $' + ++count);
                  whereValues.push(value);
                  whereOids.push(colSpec.oid);
                  continue;
                } else {
                  let vk; for (vk in value) {break}
                  switch (vk) {
                  case '$in':
                    result.push(qkey + ' && $' + ++count);
                    whereValues.push(value[vk]);
                    whereOids.push(colSpec.oid);
                    continue;
                  case '$nin':
                    result.push('NOT(' + qkey + ' && $' + ++count + ')');
                    whereValues.push(value[vk]);
                    whereOids.push(colSpec.oid);
                    continue;
                  }
                }
              }
              result.push('$' + ++count + '= ANY(' + qkey + ')');
              whereValues.push(value);
              whereOids.push(PgType.fromArrayOid(colSpec.oid));
            } else if (colSpec.isJson) {
              if (typeof value === 'object') {
                if (value.$elemMatch !== undefined) {
                  const subvalue = value.$elemMatch;
                  const columns = [];
                  for (let subcol in subvalue) {
                    columns.push(mapType(subcol, subvalue[subcol]));
                  }
                  const q = [];
                  foundIn(subvalue, q);
                  result.push('jsonb_typeof(' + qkey +
                              ') = \'array\' AND EXISTS(SELECT 1 FROM jsonb_to_recordset(' + qkey +
                              ') as __x(' + columns.join(',') + ') where ' + q.join(' AND ') + ')');
                  continue;
                }
                const q = [];
                ++count; whereValues.push(value);
                whereOids.push(3802);
                q.push(qkey + '=$' + count);
                if (Array.isArray(value)) {
                  q.push('EXISTS(SELECT * FROM jsonb_array_elements($' +
                         count + ') where value=' + qkey + ')');
                }

                q.push('(jsonb_typeof(' + qkey + ') = \'array\' AND EXISTS(SELECT * FROM jsonb_array_elements(' +
                       qkey + ') where value=$' + count + '))');

                result.push('(' + q.join(' OR ') + ')');
              } else {
                result.push(qkey + '=$' + ++count);
                whereValues.push(value);
                whereOids.push(3802);
              }
            } else {
              if (typeof value === 'object') {
                if (Array.isArray(value)) {
                  inArray(colSpec, qkey, result, value, true);
                  continue;
                } else if (value.constructor === Object) {
                  let regex;
                  for (const vk in value) {
                    const op = OPS[vk];
                    if (op !== undefined) {
                      result.push(qkey + op + '$' + ++count);
                      whereValues.push(value[vk]);
                      whereOids.push(colSpec.oid);
                      continue;
                    } else {
                      switch (vk) {
                      case '$regex':
                      case '$options':
                        if (regex) break;
                        regex = value.$regex;
                        let options = value.$options;
                        if (regex.constructor === RegExp) {
                          [regex, options] = regexToText(regex);
                        }
                        result.push(qkey + (
                          options !== undefined && options.indexOf('i') !== -1 ? '~*$' : '~$') + ++count);
                        whereValues.push(regex);
                        whereOids.push(25);
                        continue;
                      case '$ne': case '!=': {
                        const sv = value[vk];
                        if (sv == null) {
                          result.push(qkey + ' IS NOT NULL');
                        } else {
                          result.push('(' + qkey + ' <> $' + ++count + ' OR ' + qkey + ' IS NULL)');
                          whereValues.push(sv);
                          whereOids.push(colSpec.oid);
                        }
                      } continue;
                      case '$in':
                      case '$nin':
                        inArray(colSpec, qkey, result, value[vk], vk === '$in');
                        continue;
                      default:
                        result.push(qkey + '=$' + ++count);
                        whereValues.push(value);
                        whereOids.push(colSpec.oid);
                      }
                    }
                    break;
                  }
                  continue;
                }
              }
              result.push(qkey + '=$' + ++count);
              whereValues.push(value);
              whereOids.push(colSpec.oid);
            }
          }
        }
      };

      if (query.constructor === Object) {
        foundIn(query, whereSql);
      } else {
        if (query.singleId) {
          whereSql.push('"_id"=$' + ++count);
          whereValues.push(query.singleId);
          whereOids.push(0);
        }

        query._wheres !== undefined && foundIn(query._wheres, whereSql);
        query._whereSqls !== undefined && query._whereSqls.forEach((n) => {
          foundInSql(n, whereSql);
        });
        if (fields = query._whereNots) {
          const subSql = [];
          foundIn(fields, subSql);
          whereSql.push(`(${subSql.join(' OR ')}) IS NOT TRUE`);
        }

        if (fields = query._whereSomes) {
          query._whereSomes.forEach((ors) => {
            whereSql.push('(' + ors.map((q) => {
              const subSql = [];
              foundIn(q, subSql);
              return subSql.join(' AND ');
            }).join(' OR ') + ') IS TRUE');
          });
        }
      }

      if (whereSql.length === 0) {
        return;
      }

      return whereSql.join(' AND ');
    }

    query(where) {
      return queryWhere(this, 'SELECT * FROM "' + this._name + '"', where);
    }

    async findById(_id) {
      this._ready !== true && await this._ensureTable();

      const ps = this._ps_findById ??= new PgPrepSql(
        'SELECT * FROM "' + this._name + '" WHERE _id=$1 LIMIT 1').setOids([this._colMap._id.oid]);
      return this._client.withConn((conn) => ps.fetchOne(conn, [_id]));
    }

    async findOne(where, fields) {
      return (await queryWhere(this, 'SELECT ' + selectFields(this, fields) + ' FROM "' + this._name + '"',
                               where, ' LIMIT 1'))[0];
    }

    find(where, options) {
      const table = this;
      let sql = 'SELECT ' + selectFields(this, options?.fields) + ' FROM "' + this._name + '"';

      let values, oids;
      if (where != undefined) {
        values = [];
        oids = [];
        where = table.where(where, values, oids);
      }

      if (where === undefined) {
        return new Cursor(this, sql, undefined, undefined, options);
      }

      if (isPromise(where)) {
        const head = sql;
        sql = where.then((where) => where === undefined ? head : head + ' WHERE ' + where);
      } else {
        sql += ' WHERE ' + where;
      }
      return new Cursor(this, sql, values, oids, options);
    }

    show(where) {
      const values = [];
      const oids = [];
      return ` WHERE ${this.where(where, values, oids)}, (${util.inspect(values)}); oids: ${util.inspect(oids)}`;
    }

    async exists(where) {
      return (await queryWhere(this, `SELECT EXISTS (SELECT 1 FROM "${this._name}"`,
                               where, ')'))[0].exists;
    }
    async notExists(where) {return ! await this.exists(where)}

    async count(where) {
      return + (await queryWhere(this, `SELECT count(*) FROM "${this._name}"`, where))[0].count;
    }

    truncate() {
      return this._client.withConn((conn) => oidQuery(this._client, `TRUNCATE TABLE "${this._name}"`));
    }
  }

  const initCursor = async (cursor) => {
    const v = cursor._values;
    if (cursor.table._ready !== true) await cursor.table._ensureTable();
    if (isPromise(cursor._sql)) cursor._sql = await cursor._sql;

    const {_oids, _values} = cursor;
    for (let i = _oids.length; i < _values.length; ++i) {
      _oids.push(PgType.guessOid(_values[i]));
    }

    const client = cursor.table._client;
    const tx = getTransction(client);
    let sql = cursor._sql;

    if (cursor._sort) {
      let sort = '';
      const {_sort} = cursor, len = _sort.length;
      for (let i = 0; i < len; ++i) {
        let val = _sort[i];
        if (typeof val === 'string') {
          if (val[0] !== '(') val = `"${val}"`;
          sort += `${sort.length == 0 ? '' : ','}${val}`;
        } else if (val === -1) {
          sort += ' DESC';
        }
      }
      sql += ' ORDER BY ' + sort;
    }
    if (cursor._limit) sql += ' LIMIT ' + cursor._limit;
    if (cursor._offset) sql += ' OFFSET ' + cursor._offset;

    if (cursor._batchSize) {
      const cname = 'c' + (++cursorCount).toString(36);
      if (tx !== undefined && tx.transaction !== null) {
        cursor._inTran = true;
        sql = 'DECLARE ' + cname + ' CURSOR FOR ' + sql;
        const ps = (cursor.table._ps_cache.get(sql) ?? addPs(cursor.table, new PgPrepSql(sql).setOids(cursor._oids)));
        await client.withConn((conn) => ps.execute(conn, cursor._values));
      } else {
        await client.transaction(async () => {
          await getConn(client); // so cursor is valid outside transaction
          await oidQuery(client, 'DECLARE ' + cname + ' CURSOR WITH HOLD FOR ' + sql, cursor._values, cursor._oids);
        });
      }
      cursor._name = cname;
    } else {
      const ps = (cursor.table._ps_cache.get(sql) ?? addPs(cursor.table, new PgPrepSql(sql).setOids(cursor._oids)));
      cursor._rows = await client.withConn((conn) => ps.execute(conn, cursor._values));
      cursor._index = 0;
      cursor._name = 'all';
    }
  };

  class Cursor {
    constructor(table, sql, values=[], oids=[], options) {
      this.table = table;
      this._sql = sql;
      this._values = values;
      this._oids = oids;
      this._name = undefined;

      if (options) for (const op in options) {
        const func = this[op];
        if (typeof func === 'function') {
          func.call(this, options[op]);
        }
      }
    }

    async close() {
      if (this._name !== undefined && this._name !== 'all') {
        try {
          await oidQuery(this.table._client, 'CLOSE ' + this._name);
        } finally {
          this._name = undefined;
          if (this._inTran) {
            this._inTran = null;
          } else {
            releaseConn(this.table._client);
          }
        }
      }
    }

    async next(count) {
      if (this._name === undefined) await initCursor(this);
      if (this._index !== undefined) {
        if (count === undefined) {
          if (this._index >= this._rows.length) {
            return;
          }
          return this._rows[this._index++];
        } else {
          this._index += count;

          return this._rows.slice(this._index - count, this._index);
        }
      } else {
        const c = count === undefined ? 1 : count;
        const result = await oidQuery(this.table._client, 'FETCH ' + c + ' ' + this._name);
        if (typeof result === 'string') {
          return;
        }
        return count === undefined ? result[0] : result;
      }
    }

    sort(spec) {
      this._sort = spec;
      return this;
    }

    limit(value) {
      this._limit = value;
      return this;
    }

    offset(value) {
      this._offset = value;
      return this;
    }

    batchSize(value) {
      this._batchSize = value;
      return this;
    }

    async forEach(func) {
      try {
        for (let doc = this.next(); doc; doc = this.next()) {
          await func(doc);
        }
      } finally {
        await this.close();
      }
    }
  }

  const getColumnOId = (table, column) => table._colMap[column]?.oid ?? 0;

  const checkColumns = (table, params) => {
    const needCols = {};
    const colMap = table._colMap;

    for (const name in params) {
      if (colMap[name] === undefined) needCols[name] = mapType(name, params[name]);
    }

    for (const _ in needCols) return needCols;
  };

  const execute = async (conn, sql, columns) => query(conn, sql, columns.values, columns.oids);

  const performTransaction = (table, sql, params) => {
    if (table.schema || util.isObjEmpty(params.needCols)) {
      return table._client.withConn((conn) => query(conn, sql, params.values, params.oids));
    }

    return table._client.transaction(async (conn) => {
      await addColumns(table, params.needCols);
      return table._client.withConn((conn) => query(conn, sql, params.values, params.oids));
    });
  };

  const toBaseType = (value=null) => {
    if (value === null) return 'text';
    switch (typeof (value)) {
    case 'object':
      if (Array.isArray(value)) {
        const type = value.length ? toBaseType(value[0]) : 'text';
        return type + '[]';
      }
      if (match.date.test(value)) {
        return 'timestamp with time zone';
      }
      for (let key in value) {
        let type;
        if (key[0] === '$') {
          type = toBaseType(value[key]);
        }
        if (type?.slice(-2) === '[]') {
          return type.slice(0, -2);
        }
        return type;
        break;
      }
      return 'jsonb';
    case 'number':
      if (value === Math.floor(value)) {
        return 'integer';
      } else {
        return 'double precision';
      }
    case 'string':
      return 'text';
    }
  };

  const mapType = (col, value) => jsFieldToPg(col, toBaseType(value));

  const pgFieldType = (colSchema) => {
    const type = (typeof colSchema === 'string') ? colSchema : colSchema === undefined
          ? 'text'
          : colSchema.type;

    switch (type) {
    case 'number':
      return 'double precision';
    case 'string':
    case 'belongs_to':
    case 'id':
    case 'user_id_on_create':
      return 'text';
    case 'has_many':
      return 'text[]';
    case 'auto_timestamp':
      return 'timestamp';
    case 'color':
      return 'text';
    case 'object':
    case 'baseObject':
      return 'jsonb';
    default:
      return type;
    }
  };

  const jsFieldToPg = (col, colSchema, client) => {
    let defaultVal = '';

    const richType = (typeof colSchema === 'string')
          ? colSchema
          : colSchema === undefined ? 'text' : colSchema.type;

    const type = pgFieldType(richType);

    if (typeof colSchema === 'object' && colSchema.default != null) {
      const tx = getTransction(client);
      let literal = colSchema.default;
      if (type === 'jsonb') {
        literal = escapeLiteral(JSON.stringify(literal)) + '::jsonb';
      } else {
        switch (typeof literal) {
        case 'number':
        case 'boolean':
          break;
        case 'object':
          if (Array.isArray(literal)) {
            literal = escapeLiteral(PgType.aryToSqlStr(literal)) + '::' + type;
            break;
          }
        default:
          literal = escapeLiteral(literal) + '::' + type;
        }
      }
      defaultVal = ` DEFAULT ${literal}`;
    }
    const collate = (type === 'text' && richType !== 'text' || richType === 'has_many')
          ? ' collate "C"'
          : '';
    return `"${col}" ${type}${collate}${defaultVal}`;
  };

  const updateSchema = async (table, schema) => {
    const needCols = {};
    const colMap = table._colMap;
    for (let col in schema) {
      hasOwn(colMap, col) || await table._client.withConn((conn) => {
        (needCols[col] = jsFieldToPg(col, schema[col], table._client));
      });
    }

    util.isObjEmpty(needCols) ||
      await table.transaction(() => addColumns(table, needCols));
  };

  const addColumns = async (table, needCols) => {
    const prefix = `ALTER TABLE "${table._name}" ADD COLUMN `;
    const client = table._client;

    table._ps_findById = undefined;
    table._ps_cache = new Map();

    await oidQuery(client, Object.keys(needCols).map((col) => prefix + needCols[col]).join(';'));

    await readColumns(table);
  };

  const readColumns = async (table) => {
    const colQuery = `SELECT attname as name, atttypid::int4 as oid, attndims as arrayDim, attnum as order,
(select collname from pg_collation as c where c.oid = attcollation AND c.collname <> 'default') as collation_name
FROM pg_attribute
WHERE attrelid = to_regclass('${await table._client.schemaName()}."${table._name}"')::oid
AND atttypid > 0 AND attnum > 0 ORDER BY attnum`;
    const columns = await oidQuery(table._client, colQuery);
    if (columns.length == 0) {
      table._colMap = undefined;
    } else {
      table._colMap = {};
      for (const col of columns) {
        col.isJson = !! JSON_OIDS[col.oid];
        table._colMap[col.name] = col;
      }
    }
  };

  const DEFAULT_FORMAT_OPTIONS = {excludeNulls: true};

  const Driver = {
    isPG: true,

    get defaultDb() {
      if (! defaultDb) {
        defaultDb = new Client(module.config().url, 'default', module.config().formatOptions ?? DEFAULT_FORMAT_OPTIONS);
      }
      return defaultDb;
    },

    closeDefaultDb,

    connect(url, name) {
      return new Client(url, name);
    },

    get config() {return module.config()},
  };

  module.onUnload(closeDefaultDb);

  return Driver;
});
