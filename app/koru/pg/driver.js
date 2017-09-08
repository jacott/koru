define(function(require, exports, module) {
  const Future = requirejs.nodeRequire('fibers/future');
  const Libpq = requirejs.nodeRequire('pg-libpq'); // app installs this
  const koru        = require('../main');
  const makeSubject = require('../make-subject');
  const match       = require('../match');
  const Pool        = require('../pool-server');
  const util        = require('../util');

  const {hasOwn} = util;
  const pools = Object.create(null);
  let clientCount = 0;
  let cursorCount = 0;
  let conns = 0;


  koru.onunload(module, 'reload');

  koru.onunload(module, closeDefaultDb);

  const autoSchema = module.config().autoSchema || false;

  let defaultDb = null;


  class Client {
    constructor(url, name) {
      this._id = (++clientCount).toString(36);
      this._url = url;
      this._weakMap = new WeakMap;
      this.name = name || this.schemaName;
    }

    $inspect() {
      return "Pg:" + this._url;
    }

    jsFieldToPg(col, type) {
      return jsFieldToPg(col, type, this);
    }

    get schemaName() {
      if (! this._schemaName) {
        this._schemaName = this.query("SELECT current_schema")[0].current_schema;
      }
      return this._schemaName;
    }

    end() {
      const pool = pools[this._id];
      if (pool) {
        pool.drain();
      }
      delete pools[this._id];
    }

    _getConn() {
      return getConn(this);
    }

    _releaseConn() {
      return releaseConn(this);
    }

    withConn(func) {
      const tx = this._weakMap.get(util.thread);
      if (tx)
        return func.call(this, tx.conn);
      try {
        return func.call(this, getConn(this));
      } finally {
        releaseConn(this);
      }
    }

    findOne(text, params) {
      return this.query(text, params).rows[0];
    }

    query(text, params) {
      if (params && ! Array.isArray(params)) {
        const fields = params;
        const posMap = {};
        let count = 0;
        params = [];
        text = text.replace(/\{\$(\w+)\}/g, (m, key) => posMap[key] || (
          params.push(fields[key]),
          (posMap[key] = `$${++count}`)));
      }
      return this.withConn(conn => query(conn, text, params));
    }

    prepare(name, command) {
      return this.withConn(conn => {
        const future = new Future;
        conn.prepare(name, command, wait(future));
        return future.wait();
      });
    }

    execPrepared(name, params) {
      return this.withConn(conn => {
        const future = new Future;
        conn.execPrepared(name, params, wait(future));
        return future.wait();
      });
    }

    table(name, schema) {
      return new Table(name, schema, this);
    }

    dropTable(name) {
      this.query(`DROP TABLE IF EXISTS "${name}"`);
    }

    transaction(func) {
      getConn(this); // ensure connection
      const tx = this._weakMap.get(util.thread);
      try {
        if (tx.transaction) {
          const onAborts = tx._onAborts;
          tx._onAborts = null;
          if(tx.savepoint)
            ++tx.savepoint;
          else
            tx.savepoint = 1;
          let ex;
          try {
            query(tx.conn, "SAVEPOINT s"+tx.savepoint);
            const result = func.call(this, tx);
            query(tx.conn, "RELEASE SAVEPOINT s"+tx.savepoint);
            return result;
          } catch(ex1) {
            ex = ex1;
            tx.conn.isClosed() || query(tx.conn, "ROLLBACK TO SAVEPOINT s"+tx.savepoint);
            runOnAborts(tx, 'ROLLBACK');
            if (ex === 'abort')
              ex = null;
          } finally {
            --tx.savepoint;
            tx._onAborts = onAborts;
            if (ex) throw ex;
          }
        } else try {
          tx.transaction = 'COMMIT';
          query(tx.conn, 'BEGIN');
          return func.call(this, tx);
        } catch(ex) {
          tx.transaction = 'ROLLBACK';
          if (ex !== 'abort')
            throw ex;
        } finally {
          const command = tx.transaction;
          tx.transaction = null;
          tx.conn.isClosed() || query(tx.conn, command);
          runOnAborts(tx, command);
        }
      } finally {
        releaseConn(this);
      }
    }
  };

  Client.prototype.aryToSqlStr = aryToSqlStr;
  Client.prototype.columnsToInsValues = columns => `(${columns.map(k=>`"${k}"`).join(",")})
values (${columns.map(k=>`{$${k}}`).join(",")})`;



  function closeDefaultDb() {
    defaultDb && defaultDb.end();
    defaultDb = null;
  }

  function aryToSqlStr(value) {
    if (! value) return value;

    if (! Array.isArray(value))
      throw new Error('Value is not an array: '+util.inspect(value));

    return '{'+value.map(v => JSON.stringify(v)).join(',')+'}';
  }

  function getConn(client) {
    let tx = client._weakMap.get(util.thread);
    if (! tx) {
      client._weakMap.set(util.thread, tx = fetchPool(client).acquire());
    }
    if (tx.conn.isClosed()) {
      try {
        const future = new Future;
        tx.conn = new Libpq(client._url, wait(future));
        future.wait();
      } catch(ex) {
        koru.unhandledException(ex);
        throw ex;
      }
    }

    ++tx.count;

    return tx.conn;
  }

  function releaseConn(client) {
    const tx = client._weakMap.get(util.thread);
    if (tx && --tx.count === 0) {
      fetchPool(client).release(tx);
      client._weakMap.set(util.thread, null);
    }
  }

  function fetchPool(client) {
    const pool = pools[client._id];
    if (pool) return pool;
    return pools[client._id] = new Pool({
      name: client._id,
      create(callback) {
        ++conns;
        new Connection(client, callback);
      },
      destroy(tx) {
        --conns;
        tx.conn.finish();
      },
      idleTimeoutMillis: 30*1000,
    });
  }

  class Connection {
    constructor(client, callback) {
      this.conn = new Libpq(client._url, err => callback(err, this));
      this.count = 0;
    }

    onAbort(func) {
      this._onAborts = {func: func, next: this._onAborts};
    }
  }

  function runOnAborts(tx, command) {
    let onAborts = tx._onAborts;
    if (onAborts) {
      tx._onAborts = null;
      if (command === 'ROLLBACK')
        for (; onAborts; onAborts = onAborts.next)
          onAborts.func();
    }
  }

  function query(conn, text, params) {
    try {
      const future = new Future;
      if (params)
        conn.execParams(text, params, wait(future));
      else
        conn.exec(text, wait(future));

      return future.wait();
    } catch(ex) {
      if (ex.sqlState === undefined) {
        conn.finish();
      }

      const err = new Error(ex.message);
      err.sqlState = ex.sqlState;
      throw err;
    }
  }

  const buildUpdate = (table, params)=>{
    table._ensureTable();

    const set = toColumns(table, params);
    return {
      sql: `UPDATE "${table._name}" SET ${set.cols.map((col, i) => '"'+col+'"=$'+(i+1)).join(',')}`,
      set
    };
  };


  class Table {
    constructor(name, schema, client) {
      const table = this;
      table._name = name;
      table._client = client;
      Object.defineProperty(table, 'schema', {
        configurable: true,
        get() {return schema},
        set(value) {
          table._ensureTable();
          schema = value;
          if (table._ready) {
            updateSchema(table, schema);
          }
        },
      });
    }

    _resetTable() {
      this._ready = null;
    }

    _ensureTable() {
      if (this._ready === true) return;


      if (this._ready) {
        const future = new Future;
        const handle = this._ready.onChange(() => future.return());
        try {
          future.wait();
        } finally {
          handle.stop();
        }
        return this._ensureTable();
      }

      const subject = this._ready = makeSubject({});

      if (autoSchema) {
        this.autoCreate();
      } else {
        readColumns(this);
      }
      if (this._ready)
        this._ready = true;
      subject.notify();
    }

    dbType(col) {
      return pgFieldType(this.schema[col]);
    }

    autoCreate() {
      readColumns(this);
      const {schema} = this;
      if (this._columns.length === 0) {
        const fields = ['_id text collate "C" PRIMARY KEY'];
        if (schema) {
          for (let col in schema) {
            const spec = jsFieldToPg(col, schema[col], this._client);
            if (col === '_id')
              fields[0] = spec + ' PRIMARY KEY';
            else
              fields.push(spec);
          }
        }

        this._client.query(`CREATE TABLE IF NOT EXISTS "${this._name}" (${fields.join(',')})`);
        readColumns(this);
      } else if (schema) {
        updateSchema(this, schema);
      }
    }

    transaction(func) {
      return this._client.transaction(tx => func.call(this, tx));
    }

    insert(params, suffix) {
      this._ensureTable();

      params = toColumns(this, params);

      let sql = `INSERT INTO "${this._name}" (${params.cols.map(col => '"'+col+'"')
  .join(',')}) values (${params.cols.map((c, i) => "$"+(i+1)).join(",")})`;

      if (suffix) sql += ` ${suffix}`;

      try {
        return performTransaction(this, sql, params);
      } catch(ex) {
        if (ex.sqlState === '23505')
          throw new koru.Error(409, ex.message);
        throw ex;
      }
    }

    values(rowSet, cols) {
      this._ensureTable();
      return toColumns(this, rowSet, cols).values;
    }

    ensureIndex(keys, options) {
      this._ensureTable();
      options = options || {};
      let cols = Object.keys(keys);
      const name = this._name+'_'+cols.join('_');
      cols = cols.map(col => '"'+col+(keys[col] === -1 ? '" DESC' : '"'));
      const unique = options.unique ? 'UNIQUE ' : '';
      try {
        this._client.query("CREATE "+unique+"INDEX \""+
                           name+'" ON "'+this._name+'" ('+cols.join(',')+")");
      } catch(ex) {
        if (ex.sqlState !== '42P07')
          throw ex;
      }
    }

    updateById(id, params) {
      const {sql, set} = buildUpdate(this, params);

      set.values.push(id);

      return performTransaction(this, `${sql} WHERE _id=$${set.values.length}`, set);
    }

    update(whereParams, params) {
      const {sql, set} = buildUpdate(this, params);

      const where = this.where(whereParams, set.values);

      return performTransaction(this, where === undefined ? sql : `${sql} WHERE ${where}`, set);
    }

    where(query, whereValues) {
      if (query == null) return;
      const table = this;
      let count = whereValues.length;
      const colMap = table._colMap;
      let fields;

      const whereSql = [];
      if (query.constructor === Object) {
        foundIn(query, whereSql);
      } else {
        if (query.singleId) {
          whereSql.push('"_id"=$'+ ++count);
          whereValues.push(query.singleId);
        }

        query._wheres !== undefined && foundIn(query._wheres, whereSql);
        query._whereSqls !== undefined && query._whereSqls.forEach(n => {
          foundInSql(n, whereSql);
        });
        if (fields = query._whereNots) {
          const subSql = [];
          foundIn(fields, subSql);
          whereSql.push(`(${subSql.join(" OR ")}) IS NOT TRUE`);
        }

        if (fields = query._whereSomes) {
          query._whereSomes.forEach(ors => {
            whereSql.push("("+ors.map(q => {
              const subSql = [];
              foundIn(q, subSql);
              return subSql.join(" AND ");
            }).join(' OR ')+") IS TRUE");
          });
        }
      }

      if (whereSql.length === 0)
        return;

      return whereSql.join(' AND ');

      function inArray(qkey, result, value, isIn) {
        let where;
        switch (value ? value.length : 0) {
        case 0:
          result.push(isIn ? 'FALSE' : 'TRUE');
          return;
        case 1:
          whereValues.push(value[0]);
          where = qkey+" IN ($"+ ++count + ')';
          break;
        default:
          whereValues.push(aryToSqlStr(value));
          where = qkey+" = ANY($"+ ++count + ")";
        }
        result.push(isIn ? where : 'NOT ('+where+')');
      }

      function foundInSql(value, result) {
        if (typeof value === 'string')
          result.push(value);
        else {
          const items = value[1];
          const paramNos = {};
          if (Array.isArray(items)) {
            result.push(value[0]);
            items.forEach(item => {
              ++count;
              whereValues.push(item);
            });
          } else {
            result.push(value[0].replace(/\{\$([\w]+)\}/g, (m, key) => {
              const tag = paramNos[key];
              if (tag !== undefined) return tag;
              whereValues.push(items[key]);
              return paramNos[key] = '$'+ ++count;
            }));
          }
        }
      }

      function foundIn(fields, result) {
        let qkey;
        for(let key in fields) {
          const value = fields[key];
          const splitIndex = key.indexOf(".");
          if (splitIndex !== -1) {
            const remKey = key.slice(splitIndex+1);
            key = key.slice(0,splitIndex);
            qkey = `"${key}"`;
            remKey.split(".").forEach(p=>{qkey+=`->'${p}'`});
            if (value == null) {
              result.push(`${qkey}=$${++count}`);
              whereValues.push(null);
              continue;
            }
          } else {
            if (key[0] === '$') switch(key) {
            case '$sql':
              foundInSql(value, result);
              continue;
            case '$or':
            case '$and':
            case '$nor':
              const parts = [];
              util.forEach(value, w => {
                const q = [];
                foundIn(w, q);
                q.length && parts.push('('+q.join(' AND ')+')');
              });
              result.push('('+parts.join(key === '$and' ? ' AND ' :  ' OR ')+(key === '$nor'? ') IS NOT TRUE' : ')'));
              continue;
            }
            qkey = `"${key}"`;
            if (value == null) {
              result.push(qkey+' IS NULL');
              continue;
            }
          }

          const colSpec = colMap[key];

          if (value != null) switch(colSpec && colSpec.data_type) {
          case 'ARRAY':
            if (typeof value === 'object') {
              if (Array.isArray(value)) {
                result.push(qkey+' && $'+ ++count);
                whereValues.push(aryToSqlStr(value));
                continue;
              } else {
                let vk; for (vk in value) {break;}
                switch(vk) {
                case '$in':
                  result.push(qkey+' && $'+ ++count);
                  whereValues.push(aryToSqlStr(value[vk]));
                  continue;
                case '$nin':
                  result.push("NOT("+qkey+' && $'+ ++count+")");
                  whereValues.push(aryToSqlStr(value[vk]));
                  continue;
                }
              }
            }
            result.push('$'+ ++count + '= ANY('+qkey+')');
            whereValues.push(value);
            break;

          case 'jsonb':
            if (typeof value === 'object') {
              if (value.$elemMatch) {
                const subvalue = value.$elemMatch;
                const columns = [];
                for (let subcol in subvalue) {
                  columns.push(mapType(subcol, subvalue[subcol]));
                }
                const q = [];
                foundIn(subvalue, q);
                result.push('jsonb_typeof('+qkey+
                            ') = \'array\' AND EXISTS(SELECT 1 FROM jsonb_to_recordset('+qkey+
                            ') as __x('+columns.join(',')+') where '+q.join(' AND ')+')');
                continue;
              }
              const q = [];
              ++count; whereValues.push(value);
              q.push(qkey+'=$'+count);
              if (Array.isArray(value))
                q.push('EXISTS(SELECT * FROM jsonb_array_elements($'+
                       count+') where value='+qkey+ ')');

              q.push('(jsonb_typeof('+qkey+') = \'array\' AND EXISTS(SELECT * FROM jsonb_array_elements('+
                     qkey+') where value=$'+count+ '))');

              result.push('('+q.join(' OR ')+')');
            } else {
              result.push(qkey+'=$'+ ++count);
              whereValues.push(JSON.stringify(value));
            }
            break;

          default:
            if (typeof value === 'object') {
              if (Array.isArray(value)) {
                inArray(qkey, result, value, true);
                break;

              } else if (value.constructor === Object) {
                let op, regex;
                for(let vk in value) {
                  switch(vk) {
                  case '$regex':
                  case '$options':
                    if (regex) break;
                    regex = value.$regex;
                    const options = value.$options;
                    result.push(qkey+(options && options.indexOf('i') !== -1 ? '~*$': '~$')+ ++count);
                    whereValues.push(regex);
                    continue;
                  case '$ne': {
                    const sv = value[vk];
                    if (sv == null) {
                      result.push(qkey+' IS NOT NULL');
                    } else {
                      result.push('('+qkey+' <> $'+ ++count+' OR '+qkey+' IS NULL)');
                      whereValues.push(sv);
                    }
                  } continue;
                  case '$gt':
                    op = '>';
                  case '$gte':
                    op = op || '>=';
                  case '$lt':
                    op = op || '<';
                  case '$lte':
                    op = op || '<=';
                    result.push(qkey+op+'$'+ ++count);
                    whereValues.push(value[vk]);
                    op = null;
                    continue;
                  case '$in':
                  case '$nin':
                    inArray(qkey, result, value[vk], vk === '$in');
                    continue;
                  default:
                    result.push(qkey+'=$'+ ++count);
                    whereValues.push(value);
                  }
                  break;
                }
                break;
              }
            }
            result.push(qkey+'=$'+ ++count);
            whereValues.push(value);
          }
        }
      }
    }

    query(where) {
      return queryWhere(this, 'SELECT * FROM "'+this._name+'"', where);
    }

    findOne(where, fields) {
      return queryWhere(this, 'SELECT '+selectFields(this, fields)+' FROM "'+this._name+'"',
                        where, ' LIMIT 1')[0];
    }

    find(where, options) {
      this._ensureTable();

      const table = this;
      let sql = 'SELECT '+selectFields(this, options && options.fields)+' FROM "'+this._name+'"';

      let values;
      if (where) {
        values = [];
        where = table.where(where, values);
      }

      if (where === undefined)
        return new Cursor(this, sql, null, options);

      sql = sql+' WHERE '+where;
      return new Cursor(this, sql, values, options);
    }

    show(where) {
      const values = [];
      return ` WHERE ${this.where(where, values)} (${util.inspect(values)})`;
    }

    exists(where) {
      return queryWhere(this, `SELECT EXISTS (SELECT 1 FROM "${this._name}"`,
                        where, ')')[0].exists;
    }

    count(where) {
      return +queryWhere(this, `SELECT count(*) FROM "${this._name}"`,
                         where)[0].count;
    }

    remove(where) {
      return this._client.withConn(conn => queryWhere(this, `DELETE FROM "${this._name}"`, where));
    }

    truncate() {
      if (this._ready !== true) return;

      this._client.withConn(conn => this._client.query(`TRUNCATE TABLE "${this._name}"`));
    }
  };

  Table.prototype.aryToSqlStr = aryToSqlStr;

  function selectFields(table, fields) {
    if (! fields) return '*';
    let add, col;
    const result = ['_id'];
    for (col in fields) {
      if (add === undefined) {
        add = !! fields[col];
      } else if (add !== !! fields[col])
        throw new Error('fields must be all true or all false');
      if (col !== '_id' && add) {
        result.push('"'+col+'"');
      }
    }
    if (! add) for(col in table._colMap) {
      if (col === '_id') continue;
      hasOwn(fields, col) || result.push('"'+col+'"');
    }
    return result.join(',');
  }

  function initCursor(cursor) {
    if (cursor._name) return;
    const client = cursor.table._client;
    const tx = client._weakMap.get(util.thread);
    let sql = cursor._sql;

    if (cursor._sort) {
      let sort = '';
      const {_sort} = cursor, len = _sort.length;
      for(let i = 0; i < len; ++i) {
        let val = _sort[i];
        if (typeof val === 'string') {
          if (val[0] !== '(') val = `"${val}"`;
          sort += `${sort.length == 0 ? '' : ','}${val}`;
        } else if (val === -1) {
          sort += ' DESC';
        }
      }
      sql += ' ORDER BY '+sort;
    }
    if (cursor._limit) sql+= ' LIMIT '+cursor._limit;
    if (cursor._offset) sql+= ' OFFSET '+cursor._offset;

    if (cursor._batchSize) {
      const cname = 'c'+(++cursorCount).toString(36);
      if (tx && tx.transaction) {
        cursor._inTran = true;
        client.query('DECLARE '+cname+' CURSOR FOR '+sql, cursor._values);
      } else client.transaction(function () {
        getConn(client); // so cursor is valid outside transaction
        client.query('DECLARE '+cname+' CURSOR WITH HOLD FOR '+sql, cursor._values);
      });
      cursor._name = cname;
    } else {
      cursor._rows = client.query(sql, cursor._values);
      cursor._index = 0;
      cursor._name = 'all';
    }

  }

  class Cursor {
    constructor(table, sql, values, options) {
      this.table = table;
      this._sql = sql;
      this._values = values;

      if (options) for (const op in options) {
        const func = this[op];
        if (typeof func === 'function')
          func.call(this, options[op]);
      }

    }

    close() {
      if (this._name && this._name !== 'all') {
        try {
          this.table._client.query('CLOSE '+this._name);
        } finally {
          this._name = null;
          if (this._inTran) {
            this._inTran = null;
          } else {
            releaseConn(this.table._client);
          }
        }
      }
    }

    next(count) {
      initCursor(this);
      if (this._index !== undefined) {
        if (count === undefined) {
          if (this._index >= this._rows.length)
            return;
          return this._rows[this._index++];
        } else {
          this._index += count;

          return this._rows.slice(this._index - count, this._index);
        }
      } else {
        const c = count === undefined ? 1 : count;
        const result = this.table._client.query('FETCH '+c+' '+this._name);
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

    forEach(func) {
      try {
        for(let doc = this.next(); doc; doc = this.next()) {
          func(doc);
        }
      } finally {
        this.close();
      }
    }
  };


  function queryWhere(table, sql, where, suffix) {
    table._ensureTable();

    let values;
    if (where) {
      values = [];
      where = table.where(where, values);
    }
    if (where === undefined) {
      if (suffix) sql += suffix;
      return table._client.query(sql);
    }

    sql = sql+' WHERE '+where;
    if (suffix) sql += suffix;

    return table._client.query(sql, values);
  }

  function toColumns(table, params, cols) {
    const needCols = autoSchema && {};
    cols = cols || Object.keys(params);
    const values = new Array(cols.length);
    const colMap = table._colMap;

    util.forEach(cols, function (col, i) {
      let value = params[col];
      if (value === undefined) value = null;
      const desc = colMap[col];
      if (desc) {
        switch (desc.data_type) {
        case 'ARRAY':
          value = aryToSqlStr(value);
          break;
        case 'jsonb':
        case 'json':
          value = value == null ? null : JSON.stringify(value);
          break;
        case 'date':
        case 'timestamp with time zone':
        case 'timestamp without time zone':
          if (value) {
            if (value.toISOString)
              value = value && value.toISOString();
            else {
              let date = new Date(value);
              if (! isNaN(+date))
                value = date.toISOString();
            }
          }
          break;
        }
      }
      values[i] = value;

      if (needCols && ! desc) {
        needCols[col] = mapType(col, params[col]);
      }
    });

    const res = {cols: cols, values: values};
    if (needCols) res.needCols = needCols;
    return res;
  }

  function performTransaction(table, sql, params) {
    if (table.schema || util.isObjEmpty(params.needCols)) {
      return table._client.withConn(function (conn) {
        return this.query(sql, params.values);
      });
    }

    return table._client.transaction(function (conn) {
      addColumns(table, params.needCols);
      return this.query(sql, params.values);
    });
  }

  function toBaseType(value) {
    if (value == null) return 'text';
    switch(typeof(value)) {
    case 'object':
      if (Array.isArray(value)) {
        const type = value.length ? toBaseType(value[0]) : 'text';
        return type+'[]';
      }
      if (match.date.$test(value))
        return 'timestamp with time zone';
      for (let key in value) {
        let type;
        if (key.slice(0,1) === '$')
          type = toBaseType(value[key]);
        if (type && type.slice(-2) === '[]')
          return type.slice(0, -2);
        return type;
        break;
      }
      return 'jsonb';
    case 'number':
      if (value === Math.floor(value))
        return 'integer';
      else
        return 'double precision';
    case 'string':
      return 'text';
    }
  }

  function mapType(col, value) {
    const type = toBaseType(value);
    return jsFieldToPg(col, type);
  }

  function pgFieldType(colSchema) {
    const type = (typeof colSchema === 'string') ? colSchema : colSchema ? colSchema.type : 'text';

    switch(type) {
    case 'string':
      return 'text';
    case 'number':
      return 'double precision';
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
  }

  function jsFieldToPg(col, colSchema, client) {
    let defaultVal = '';

    const richType = (typeof colSchema === 'string') ?
            colSchema : colSchema ? colSchema.type : 'text';

    const type = pgFieldType(richType);

    if(typeof colSchema === 'object' && colSchema.default != null) {
      let literal = colSchema.default;
      client.withConn(function (conn) {
        if (type === 'jsonb')
          literal = conn.escapeLiteral(JSON.stringify(literal))+'::jsonb';
        else switch (typeof literal) {
        case 'number':
        case 'boolean':
          break;
        case 'object':
          if (Array.isArray(literal)) {
            literal = conn.escapeLiteral(aryToSqlStr(literal))+'::'+type;
            break;
          }
        default:
          literal = conn.escapeLiteral(literal)+'::'+type;
        }
      });
      defaultVal = ` DEFAULT ${literal}`;
    }
    const collate = (type === 'text' && richType !== 'text' || richType === 'has_many')
            ? ' collate "C"' : '';
    return `"${col}" ${type}${collate}${defaultVal}`;
  }

  function updateSchema(table, schema) {
    const needCols = {};
    const colMap = table._colMap;
    for ( let col in schema) {
      hasOwn(colMap, col) ||
        (needCols[col] = jsFieldToPg(col, schema[col], table._client));
    }

    util.isObjEmpty(needCols) ||
      table.transaction(function () {
        addColumns(table, needCols);
      });
  }

  function addColumns(table, needCols) {
    const prefix = `ALTER TABLE "${table._name}" ADD COLUMN `;
    const client = table._client;

    client.query(Object.keys(needCols).map(col => prefix + needCols[col]).join(';'));

    readColumns(table);
  }

  function readColumns(table) {
    const colQuery = `SELECT * FROM information_schema.columns
WHERE table_name = '${table._name}' AND table_schema = '${table._client.schemaName}'`;
    table._columns = table._client.query(colQuery);
    table._colMap = util.toMap('column_name', null, table._columns);
  }

  const wait = future => (err, result)=>{
    if (err) {
      err.message = err.message.replace(/^ERROR:\s*/, '');
      future.throw(err);
    }
    else future.return(result);
  };

  module.exports = {
    isPG: true,

    aryToSqlStr,

    get defaultDb() {
      if (! defaultDb) {
        defaultDb = new Client(module.config().url, 'default');
      }
      return defaultDb;
    },

    closeDefaultDb,

    connect(url, name) {
      return new Client(url, name);
    },
  };
});
