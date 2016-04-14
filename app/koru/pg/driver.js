var Future = requirejs.nodeRequire('fibers/future');
var Libpq = requirejs.nodeRequire('pg-libpq'); // app installs this

var koru, util, makeSubject, match, Pool;

var pools = {};
var clientCount = 0;
var cursorCount = 0;
var autoSchema = false;

define(function(require, exports, module) {
  koru = require('../main');
  util = require('../util');
  makeSubject = require('../make-subject');
  match = require('../match');
  Pool = require('../pool-server');

  koru.onunload(module, 'reload');

  koru.onunload(module, closeDefaultDb);

  autoSchema = module.config().autoSchema || false;

  var defaultDb = null;

  function closeDefaultDb() {
    defaultDb && defaultDb.end();
    defaultDb = null;
  }

  return {
    isPG: true,

    get defaultDb() {
      if (defaultDb) return defaultDb;
      return defaultDb = new Client(module.config().url);
    },

    closeDefaultDb: closeDefaultDb,

    connect: function (url) {
      return new Client(url);
    },
  };
});

function aryToSqlStr(value) {
  if (! value) return value;

  if (! Array.isArray(value))
    throw new Error('Value is not an array: '+util.inspect(value));

  return '{'+value.map(function (v) {
    return JSON.stringify(v);
  }).join(',')+'}';
}

function getConn(client) {
  var tx = client._weakMap.get(util.thread);
  if (! tx) {
    client._weakMap.set(util.thread, tx = fetchPool(client).acquire());
  }
  ++tx.count;

  return tx.conn;
}

function releaseConn(client) {
  var tx = client._weakMap.get(util.thread);
  if (tx && --tx.count === 0) {
    fetchPool(client).release(tx);
    client._weakMap.set(util.thread, null);
  }
}

var conns = 0;

function fetchPool(client) {
  var pool = pools[client._id];
  if (pool) return pool;
  return pools[client._id] = new Pool({
    name: client._id,
    create: function (callback) {
      ++conns;
      new Connection(client, callback);
    },
    destroy: function (tx) {
      --conns;
      tx.conn.finish();
    },
    idleTimeoutMillis: 30*1000,
  });
}

function Connection(client, callback) {
  var self = this;
  var conn = self.conn = new Libpq(client._url, function (err) {
    callback(err, self);
  });
  self.count = 0;
  self.onAbort = function (func) {
    if (! self._onAborts) self._onAborts = [func];
    else
      self._onAborts.push(func);
  };
}

function Client(url) {
  this._id = (++clientCount).toString(36);
  this._url = url;
  this._weakMap = new WeakMap;
}

Client.prototype = {
  constructor: Client,

  $inspect: function () {
    return "Pg:" + this._url;
  },

  get schemaName() {
    if (! this._schemaName) {
      this._schemaName = this.query("SELECT current_schema")[0].current_schema;
    }
    return this._schemaName;
  },

  end: function () {
    var pool = pools[this._id];
    if (pool) {
      pool.drain();
    }
    delete pools[this._id];
  },

  _getConn: function () {return getConn(this)},
  _releaseConn: function () {return releaseConn(this)},

  withConn: function(func) {
    var tx = this._weakMap.get(util.thread);
    if (tx)
      return func.call(this, tx.conn);
    try {
      return func.call(this, getConn(this));
    } finally {
      releaseConn(this);
    }
  },

  aryToSqlStr: aryToSqlStr,

  findOne: function (text, params) {
    return this.query(text, params).rows[0];
  },

  query: function (text, params) {
    if (params && ! Array.isArray(params)) {
      var fields = params;
      var posMap = {};
      var count = 0;
      params = [];
      text = text.replace(/\{\$(\w+)\}/g, function (m, key) {
        var pos = posMap[key];
        if (! pos) {
          pos = posMap[key] = '$' + ++count;
          params.push(fields[key]);
        }
        return pos;
      });
    }
    return this.withConn(function (conn) {
      return query(conn, text, params);
    });
  },

  prepare: function (name, command) {
    return this.withConn(function (conn) {
      var future = new Future;
      conn.prepare(name, command, wait(future));
      return future.wait();
    });
  },

  execPrepared: function (name, params) {
    return this.withConn(function (conn) {
      var future = new Future;
      conn.execPrepared(name, params, wait(future));
      return future.wait();
    });
  },

  table: function (name, schema) {
    return new Table(name, schema, this);
  },

  dropTable: function (name) {
    this.query('DROP TABLE IF EXISTS "' + name + '"');
  },

  transaction: function (func) {
    getConn(this); // ensure connection
    var tx = this._weakMap.get(util.thread);
    try {
      if (tx.transaction) {
        var onAborts = tx._onAborts;
        tx._onAborts = null;
        if(tx.savepoint)
          ++tx.savepoint;
        else
          tx.savepoint = 1;
        try {
          var ex;
          query(tx.conn, "SAVEPOINT s"+tx.savepoint);
          var result = func.call(this, tx);
          query(tx.conn, "RELEASE SAVEPOINT s"+tx.savepoint);
          return result;
        } catch(ex1) {
          ex = ex1;
          query(tx.conn, "ROLLBACK TO SAVEPOINT s"+tx.savepoint);
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
        var command = tx.transaction;
        tx.transaction = null;
        query(tx.conn, command);
        runOnAborts(tx, command);
      }
    } finally {
      releaseConn(this);
    }
  },
};

function runOnAborts(tx, command) {
  var onAborts = tx._onAborts;
  if (onAborts) {
    tx._onAborts = null;
    if (command === 'ROLLBACK')
      onAborts.forEach(function (f) {
        f();
      });
  }
}

function query(conn, text, params) {
  var future = new Future;
  if (params)
    conn.execParams(text, params, wait(future));
  else
    conn.exec(text, wait(future));

  return future.wait();
}

function Table(name, schema, client) {
  var table = this;
  table._name = name;
  table._client = client;
  Object.defineProperty(table, 'schema', {
    get: function () {
      return schema;
    },
    set: function (value) {
      while (table._ready && table._ready !== true) {
        table._ensureTable();
      }
      schema = value;
      if (table._ready) {
        updateSchema(table, schema);
      }
    },
  });
}

Table.prototype = {
  constructor: Table,

  isPG: true,

  _ensureTable: function () {
    if (this._ready === true) return;

    var future = new Future;

    if (this._ready) {
      var handle = this._ready.onChange(function () {
        future.return();
      });
      try {
        return future.wait();
      } finally {
        handle.stop();
      }
    }

    var subject = this._ready = makeSubject({});

    if (autoSchema) {
      this.autoCreate();
    } else {
      readColumns(this);
    }
    this._ready = true;
    subject.notify();
  },

  aryToSqlStr: aryToSqlStr,

  dbType: function (col) {
    return pgFieldType(this.schema[col]);
  },

  autoCreate: function () {
    readColumns(this);
    var schema = this.schema;
    if (this._columns.length === 0) {
      var fields = ['_id varchar(24) PRIMARY KEY'];
      if (schema) {
        for (var col in schema) {
          var spec = jsFieldToPg(col, schema[col], this._client);
          if (col === '_id')
            fields[0] = spec + ' PRIMARY KEY';
          else
            fields.push(spec);
        }
      }

      this._client.query('CREATE TABLE IF NOT EXISTS "'+this._name+'" ('+fields.join(',')+')');
      readColumns(this);
    } else if (schema) {
      updateSchema(this, schema);
    }
  },

  transaction: function (func) {
    var table = this;
    return table._client.transaction(function (tx) {
      return func.call(table, tx);
    });
  },

  insert: function (params, suffix) {
    this._ensureTable();

    params = toColumns(this, params);

    var sql = 'INSERT INTO "'+this._name+'" ('+params.cols.map(function (col) {
      return '"'+col+'"';
    }).join(',')+') values (' +
          params.cols.map(function (c, i) {return "$"+(i+1)}).join(",")+')';

    if (suffix) sql += ` ${suffix}`;

    return performTransaction(this, sql, params);
  },

  values: function (rowSet, cols) {
    this._ensureTable();
    return toColumns(this, rowSet, cols).values;
  },

  koruUpdate: function (doc, changes) {
    doc = doc.attributes;
    var params = {};
    for (var key in changes) {
      var sc = changes[key];
      for (key in  sc) {
        var di = key.indexOf('.');
        if (di === -1)
          params[key] = doc[key];
        else {
          key = key.substring(0, di);
          if (! params.hasOwnProperty(key))
            params[key] = doc[key];
        }
      }
    }
    var sql = 'UPDATE "'+this._name+'" SET ';
    var set = toColumns(this, params);
    sql += set.cols.map(function (col, i) {
      return '"'+col+'"=$'+(i+1);
    }).join(',');

    set.values.push(doc._id);

    sql += ' WHERE _id=$'+set.values.length;

    return performTransaction(this, sql, set);
  },

  ensureIndex: function (keys, options) {
    this._ensureTable();
    options = options || {};
    var cols = Object.keys(keys);
    var name = this._name+'_'+cols.join('_');
    cols = cols.map(function (col) {
      return '"'+col+(keys[col] === -1 ? '" DESC' : '"');
    });
    var unique = options.unique ? 'UNIQUE ' : '';
    try {
      this._client.query("CREATE "+unique+"INDEX \""+
                         name+'" ON "'+this._name+'" ('+cols.join(',')+")");
    } catch(ex) {
      if (ex.sqlState !== '42P07')
        throw ex;
    }
  },

  update: function (where, params) {
    this._ensureTable();

    var sql = 'UPDATE "'+this._name+'" SET ';

    var set = toColumns(this, params.$set);
    sql += set.cols.map(function (col, i) {
      return '"'+col+'"=$'+(i+1);
    }).join(',');

    where = this.where(where, set.values);

    if (where)
      sql += ' WHERE '+where;

    return performTransaction(this, sql, set);
  },

  where: function (query, whereValues) {
    if (! query) return;
    var table = this;
    var count = whereValues.length;
    var colMap = table._colMap;
    var fields;

    var whereSql = [];
    if (query.constructor === Object) {
      foundIn(query, whereSql);
    } else {
      if (query.singleId) {
        whereSql.push('"_id"=$'+ ++count);
        whereValues.push(query.singleId);
      }

      query._wheres && foundIn(query._wheres, whereSql);

      if (fields = query._whereNots) {
        var subSql = [];
        foundIn(fields, subSql);
        whereSql.push("(" + subSql.join(" OR ") + ") IS NOT TRUE");
      }

      if (fields = query._whereSomes) {
        query._whereSomes.forEach(function (ors) {
          whereSql.push("("+ors.map(function (q) {
            var subSql = [];
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
      switch (value.length) {
      case 0:
        result.push(isIn ? 'FALSE' : 'TRUE');
        return;
      case 1:
        whereValues.push(value[0]);
        var where = qkey+" IN ($"+ ++count + ')';
        break;
      default:
        whereValues.push(aryToSqlStr(value));
        var where = qkey+" = ANY($"+ ++count + ")";
      }
      result.push(isIn ? where : 'NOT ('+where+')');
    }

    function foundIn(fields, result) {
      for(var key in fields) {
        var value = fields[key];
        var splitIndex = key.indexOf(".");
        if (splitIndex !== -1) {
          var remKey = key.slice(splitIndex+1);
          key = key.slice(0,splitIndex);
          var qkey = ['"'+key+'"'];
          remKey.split(".").forEach(function (p) {
            qkey.push("'"+p+ "'");
          });
          qkey = qkey.join("->");
          if (value == null) {
            result.push(qkey+' = $'+ ++count);
            whereValues.push(null);
            continue;
          }
        } else {
          if (key[0] === '$') switch(key) {
          case '$sql':
            if (typeof value === 'string')
              result.push(value);
            else {
              var items = value[1];
              if (Array.isArray(items)) {
                result.push(value[0]);
                items.forEach(function (item) {
                  ++count;
                  whereValues.push(item);
                });
              } else {
                result.push(value[0].replace(/\{\$([\w]+)\}/g, function (m, key) {
                  whereValues.push(items[key]);
                  return '$'+ ++count;
                }));
              }
            }
            continue;
          case '$or':
          case '$and':
          case '$nor':
            var parts = [];
            util.forEach(value, function (w) {
              var q = [];
              foundIn(w, q);
              q.length && parts.push('('+q.join(' AND ')+')');
            });
            result.push('('+parts.join(key === '$and' ? ' AND ' :  ' OR ')+(key === '$nor'? ') IS NOT TRUE' : ')'));
            continue;
          }
          var qkey = '"'+key+'"';
          if (value == null) {
            result.push(qkey+' IS NULL');
            continue;
          }
        }

        var colSpec = colMap[key];

        if (value != null) switch(colSpec && colSpec.data_type) {
        case 'ARRAY':
          if (typeof value === 'object') {
            if (Array.isArray(value)) {
              result.push(qkey+' && $'+ ++count);
              whereValues.push(aryToSqlStr(value));
              continue;
            } else {
              for (var vk in value) {break;}
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
              var subvalue = value.$elemMatch;
              var columns = [];
              for (var subcol in subvalue) {
                columns.push(mapType(subcol, subvalue[subcol]));
              }
              var q = [];
              foundIn(subvalue, q);
              result.push('jsonb_typeof('+qkey+
                            ') = \'array\' AND EXISTS(SELECT 1 FROM jsonb_to_recordset('+qkey+
                            ') as __x('+columns.join(',')+') where '+q.join(' AND ')+')');
              continue;
            }
            var q = [];
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
              for(var vk in value) {
                switch(vk) {
                case '$regex':
                case '$options':
                  if (regex) break;
                  var regex = value.$regex;
                  var options = value.$options;
                  result.push(qkey+(options && options.indexOf('i') !== -1 ? '~*$': '~$')+ ++count);
                  whereValues.push(regex);
                  continue;
                case '$ne':
                  value = value[vk];
                  if (value == null) {
                    result.push(qkey+' IS NOT NULL');
                  } else {
                    result.push('('+qkey+' <> $'+ ++count+' OR '+qkey+' IS NULL)');
                    whereValues.push(value);
                  }
                  continue;
                case '$gt':
                  var op = '>';
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
  },

  query: function (where) {
    return queryWhere(this, 'SELECT * FROM "'+this._name+'"', where);
  },

  findOne: function (where, fields) {
    return queryWhere(this, 'SELECT '+selectFields(this, fields)+' FROM "'+this._name+'"',
                      where, ' LIMIT 1')[0];
  },

  find: function (where, options) {
    this._ensureTable();

    var table = this;
    var sql = 'SELECT '+selectFields(this, options && options.fields)+' FROM "'+this._name+'"';


    if (where) {
      var values = [];
      where = table.where(where, values);
    }

    if (where === undefined)
      return new Cursor(this, sql, null, options);

    sql = sql+' WHERE '+where;
    return new Cursor(this, sql, values, options);
  },

  show: function (where) {
    var values = [];
    return ' WHERE ' + this.where(where, values) + ' ('+ util.inspect(values) + ')';
  },

  exists: function (where) {
    return queryWhere(this, 'SELECT EXISTS (SELECT 1 FROM "'+this._name+'"',
                      where, ')')[0].exists;
  },

  count: function (where) {
    return +queryWhere(this, 'SELECT count(*) FROM "'+this._name+'"',
                      where)[0].count;
  },

  remove: function (where) {
    var table = this;
    return table._client.withConn(function (conn) {
      return queryWhere(table, 'DELETE FROM "'+table._name+'"', where);
    });
  },

  truncate: function () {
    if (this._ready !== true) return;

    var table = this;
    table._client.withConn(function (conn) {
      table._client.query('TRUNCATE TABLE "'+table._name+'"');
    });
  },
};

function selectFields(table, fields) {
  if (! fields) return '*';
  var add;
  var result = ['_id'];
  for (var col in fields) {
    if (add === undefined) {
      add = !! fields[col];
    } else if (add !== !! fields[col])
      throw new Error('fields must be all true or all false');
    if (col !== '_id' && add) {
      result.push('"'+col+'"');
    }
  }
  if (! add) for(var col in table._colMap) {
    if (col === '_id') continue;
    fields.hasOwnProperty(col) || result.push('"'+col+'"');
  }
  return result.join(',');
}

function Cursor(table, sql, values, options) {
  this.table = table;
  this._sql = sql;
  this._values = values;

  if (options) for (var op in options) {
    var func = this[op];
    if (typeof func === 'function')
      func.call(this, options[op]);
  }

}

function initCursor(cursor) {
  if (cursor._name) return;
  var client = cursor.table._client;
  var tx = client._weakMap.get(util.thread);
  var sql = cursor._sql;
  if (cursor._sort) {
    sql += ' ORDER BY '+Object.keys(cursor._sort).map(function (k) {
      return '"'+k+(cursor._sort[k] === -1 ? '" DESC' : '"');
    }).join(',');
  }
  if (cursor._limit) sql+= ' LIMIT '+cursor._limit;

  if (cursor._batchSize) {
    var cname = 'c'+(++cursorCount).toString(36);
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

Cursor.prototype = {
  constructor: Cursor,

  close: function () {
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
  },

  next: function (count) {
    initCursor(this);
    if (this.hasOwnProperty('_index')) {
      if (count === undefined) {
        if (this._index >= this._rows.length)
          return;
        return this._rows[this._index++];
      } else {
        this._index += count;

        return this._rows.slice(this._index - count, this._index);
      }
    } else {
      var c = count === undefined ? 1 : count;
      var result = this.table._client.query('FETCH '+c+' '+this._name);
      return count === undefined ? result[0] : result;
    }
  },

  sort: function (spec) {
    this._sort = spec;
    return this;
  },

  limit: function (value) {
    this._limit = value;
    return this;
  },

  batchSize: function (value) {
    this._batchSize = value;
    return this;
  },

  forEach: function (func) {
    try {
      for(var doc = this.next(); doc; doc = this.next()) {
        func(doc);
      }
    } finally {
      this.close();
    }
  },
};


function queryWhere(table, sql, where, suffix) {
  table._ensureTable();

  if (where) {
    var values = [];
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
  var needCols = autoSchema && {};
  cols = cols || Object.keys(params);
  var values = new Array(cols.length);
  var colMap = table._colMap;

  util.forEach(cols, function (col, i) {
    var value = params[col];
    if (value === undefined) value = null;
    var desc = colMap[col];
    if (desc) {
      switch (desc.data_type) {
      case 'ARRAY':
        value = aryToSqlStr(value);
        break;
      case 'jsonb':
      case 'json':
        value = JSON.stringify(value);
        break;
      case 'date':
      case 'timestamp with time zone':
      case 'timestamp without time zone':
        value = value && value.toISOString();
        break;
      }
    }
    values[i] = value;

    if (needCols && ! desc) {
      needCols[col] = mapType(col, params[col]);
    }
  });

  var res = {cols: cols, values: values};
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
      var type = value.length ? toBaseType(value[0]) : 'text';
      return type+'[]';
    }
    if (match.date.$test(value))
      return 'timestamp with time zone';
    for (var key in value) {
      if (key.slice(0,1) === '$')
        var type = toBaseType(value[key]);
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
  var type = toBaseType(value);
  return jsFieldToPg(col, type);
}

function pgFieldType(colSchema) {
  if (typeof colSchema === 'string')
    var type = colSchema;
  else
    var type = colSchema ? colSchema.type : 'text';

  switch(type) {
  case 'string':
    return 'text';
  case 'number':
    return 'double precision';
  case 'belongs_to':
  case 'id':
  case 'user_id_on_create':
    return 'varchar(24)';
  case 'has_many':
    return 'varchar(24) ARRAY';
  case 'auto_timestamp':
    return 'timestamp';
  case 'color':
    return 'varchar(9)';
  case 'object':
  case 'baseObject':
    return 'jsonb';
  default:
    return type;
  }
}

function jsFieldToPg(col, colSchema, client) {
  var defaultVal = '';

  var type = pgFieldType(colSchema);

  if(typeof colSchema === 'object' && colSchema.default != null) {
    var literal = colSchema.default;
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
    defaultVal = ' DEFAULT ' + literal;;
  }
  return '"' + col + '" ' + type + defaultVal;
}

function updateSchema(table, schema) {
  var needCols = {};
  var colMap = table._colMap;
  for (var col in schema) {
    colMap.hasOwnProperty(col) ||
      (needCols[col] = jsFieldToPg(col, schema[col], table._client));
  }

  util.isObjEmpty(needCols) ||
    table.transaction(function () {
      addColumns(table, needCols);
    });
}

function addColumns(table, needCols) {
  var prefix = 'ALTER TABLE "'+table._name+'" ADD COLUMN ';
  var client = table._client;

  client.query(Object.keys(needCols).map(function (col) {
    return prefix + needCols[col];
  }).join(';'));

  readColumns(table);
}

function readColumns(table) {
  var colQuery = "SELECT * FROM information_schema.columns WHERE table_name = '" +
        table._name + "' AND table_schema = '"+table._client.schemaName+"'";
  table._columns = table._client.query(colQuery);
  table._colMap = util.toMap('column_name', null, table._columns);
}

function wait(future) {
  return function (err, result) {
    if (err) {
      future.throw(err);
    }
    else future.return(result);
  };
}
