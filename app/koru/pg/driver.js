var Future = requirejs.nodeRequire('fibers/future');
var pg = require('pg-native'); // app installs this
var poolModule = requirejs.nodeRequire('generic-pool');
var pgTypes = requirejs.nodeRequire('pg-types');
var koru, util, makeSubject, match;

var pools = {};
var clientCount = 0;
var cursorCount = 0;
var CONFIG = {
  types: pgTypes,
};

// timestamp without zone
pgTypes.setTypeParser(1114, 'text', function (value) {
  return new Date(value+'Z');
});

define(function(require, exports, module) {
  koru = require('../main');
  util = require('../util');
  makeSubject = require('../make-subject');
  match = require('../match');

  koru.onunload(module, closeDefaultDb);

  var defaultDb = null;

  function closeDefaultDb() {
    defaultDb && defaultDb.end();
    defaultDb = null;
  }

  return {
    get defaultDb() {
      if (defaultDb) return defaultDb;
      return defaultDb = new Client(module.config().url);
    },

    get defaults() {return pg.defaults},

    closeDefaultDb: closeDefaultDb,

    connect: function (url) {
      return new Client(url);
    },
  };
});

function aryToSqlStr(value) {
  if (! value) return value;
  return '{'+value.map(function (v) {
    return JSON.stringify(v);
  }).join(',')+'}';
}

function getConn(client) {
  var tx = client._weakMap.get(util.thread);
  if (! tx) {
    var pool = fetchPool(client);
    var future = new Future;
    pool.acquire(wait(future));
    client._weakMap.set(util.thread, tx = future.wait());
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

function fetchPool(client) {
  var pool = pools[client._id];
  if (pool) return pool;
  return pools[client._id] = poolModule.Pool({
    name: 'pg-driver',
    create: function (callback) {
      var tx = {
        conn: new pg(CONFIG),
        count: 0,
      };
      var future = new Future;
      tx.conn.connect(client._url, wait(future));
      future.wait();
      callback(null, tx);
    },
    destroy: function (tx) {
      var future = new Future;
      tx.conn.end(wait(future));
      future.wait();
    },
    max: 10,
    min: 0,
    idleTimeoutMillis : 30000,
    reapIntervalMillis: 20000,
    log: false,
  });
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

  end: function () {
    var pool = pools[this._id];
    if (pool) {
      pool.drain();
    }
    delete pools[this._id];
  },

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

  findOne: function (text, params) {
    return this.query(text, params).rows[0];
  },

  query: function (text, params) {
    return this.withConn(function (conn) {
      return query(conn, text, params);
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
      if (tx.transaction)
        return func.call(this, tx.conn);

      try {
        tx.transaction = 'COMMIT';
        query(tx.conn, 'BEGIN');
        return func.call(this, tx.conn);
      } catch(ex) {
        tx.transaction = 'ROLLBACK';
        if (ex !== 'abort')
          throw ex;
      } finally {
        var command = tx.transaction;
        tx.transaction = null;
        query(tx.conn, command);
      }
    } finally {
      releaseConn(this);
    }
  },
};

function query(conn, text, params) {
  var future = new Future;
  if (params)
    conn.query(text, params, wait(future));
  else
    conn.query(text, wait(future));
  try {
    return future.wait();
  } catch(ex) {
    var msg = new Error(ex.message);
    var fields = conn.pq.$resultErrorFields();
    for (var field in fields) {
      msg[field] = fields[field];
    }
    throw msg;
  }
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

    readColumns(this);
    var schema = this.schema;
    if (this._columns.length === 0) {
      var fields = ['_id varchar(17) PRIMARY KEY'];
      if (schema) {
        for (var col in schema)
          fields.push(jsFieldToPg(col, schema[col]));
      }
      this._client.query('CREATE TABLE IF NOT EXISTS "'+this._name+'" ('+fields.join(',')+')');
      readColumns(this);
    } else if (schema) {
      updateSchema(this, schema);
    }
    this._ready = true;
    subject.notify();
  },

  transaction: function (func) {
    var table = this;
    return table._client.transaction(function () {
      return func.call(table);
    });
  },

  insert: function (params) {
    this._ensureTable();
    params = toColumns(this, params);

    var sql = 'INSERT INTO "'+this._name+'" ('+params.cols.map(function (col) {
      return '"'+col+'"';
    }).join(',')+') values (' +
          params.cols.map(function (c, i) {return "$"+(i+1)}).join(",")+')';

    return performTransaction(this, sql, params);
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

  where: function (where, whereValues) {
    var table = this;
    var count = whereValues.length;
    return where1(where);

    function where1(where) {
      var whereSql = [];
      for (var key in  where) {
        if (key[0] === '$') switch(key) {
        case '$or':
        case '$and':
          var parts = [];
          util.forEach(where[key], function (w) {
            parts.push(where1(w));
          });
          whereSql.push('('+parts.join(key === '$or' ? ' OR ' :  ' AND ')+')');
          continue;
        case '$and':

        }
        ++count;
        var value = where[key];
        if (value && typeof value === 'object') {
          for(var vk in value) {
            switch(vk) {
            case '$in':
              --count;
              value = value[vk];
              switch (table._colMap[key].data_type) {
              case 'ARRAY':
                whereSql.push('"'+key+'" && $'+ (++count));
                whereValues.push(aryToSqlStr(value));
                break;
              default:
                var param = [];
                util.forEach(value, function (v) {
                  param.push('$'+(++count));
                  whereValues.push(v);
                });
                whereSql.push('"'+key+'" in ('+param.join(',')+')');
              }
              break;

            case '$ne':
              whereSql.push('"'+key+'"<>$'+count);
              whereValues.push(value[value[vk]]);
              break;
            }
            break;
          }
        } else {
          switch (table._colMap[key].data_type) {
          case 'ARRAY':
            whereSql.push('$'+count+' = ANY ("'+key+'")');
            whereValues.push(value);
            break;
          default:
            whereSql.push('"'+key+'"=$'+count);
            whereValues.push(value);
          }
        }
      }
      if (whereSql.length)
        return whereSql.join(' AND ');
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
    var table = this;
    var sql = 'SELECT '+selectFields(this, options && options.fields)+' FROM "'+this._name+'"';

    if (util.isObjEmpty(where))
      return new Cursor(this, sql);

    var values = [];
    where = table.where(where, values);
    sql = sql+' WHERE '+where;
    return new Cursor(this, sql, values);
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
    queryWhere(this, 'DELETE FROM "'+this._name+'"', where);
    return +getConn(this._client).pq.$cmdTuples();
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

function Cursor(table, sql, values) {
  this.table = table;
  this._sql = sql;
  this._values = values;
}

function initCursor(cursor) {
  if (cursor._name) return;
  var client = cursor.table._client;
  var tx = client._weakMap.get(util.thread);
  cursor._name = 'c'+(++cursorCount).toString(36);
  var sql = cursor._sql;
  if (cursor._limit) sql+= ' LIMIT '+cursor._limit;
  if (tx && tx.transaction) {
    cursor._inTran = true;
    client.query('DECLARE '+cursor._name+' CURSOR FOR '+sql, cursor._values);
  } else client.transaction(function () {
    getConn(client); // so cursor is valid outside transaction
    client.query('DECLARE '+cursor._name+' CURSOR WITH HOLD FOR '+sql, cursor._values);
  });
}

Cursor.prototype = {
  constructor: Cursor,

  close: function () {
    if (this._name) {
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
    var c = count === undefined ? 1 : count;
    var result = this.table._client.query('FETCH '+c+' '+this._name);
    return count === undefined ? result[0] : result;
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
    // FIXME do we need this for fetch
    return this;
  },

  forEach: function (func) {
    for(var doc = this.next(); doc; doc = this.next()) {
      func(doc);
    }
  },
};


function queryWhere(table, sql, where, suffix) {
  table._ensureTable();

  if (util.isObjEmpty(where)) {
    if (suffix) sql += suffix;
    return table._client.query(sql);
  }

  var values = [];
  where = table.where(where, values);
  sql = sql+' WHERE '+where;
  if (suffix) sql += suffix;
  return table._client.query(sql, values);
}

function toColumns(table, params) {
  var needCols = {};
  var cols = Object.keys(params);
  var values = new Array(cols.length);
  var colMap = table._colMap;

  util.forEach(cols, function (col, i) {
    var value = params[col];
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
      case 'timestamp without time zone':
        value = value && value.toISOString();
        break;
      }
    }
    values[i] = value;

    if (! desc) {
      needCols[col] = mapType(col, params[col]);
    }
  });

  return {needCols: needCols, cols: cols, values: values};
}

function performTransaction(table, sql, params) {
  if (table.schema || util.isObjEmpty(params.needCols)) {
    return table._client.withConn(function (conn) {
      this.query(sql, params.values);
      return +conn.pq.$cmdTuples();
    });
  }

  return table._client.transaction(function (conn) {
    addColumns(table, params.needCols);
    this.query(sql, params.values);
      return +conn.pq.$cmdTuples();
  });
}

function mapType(col, value, desc) {
  var type = typeof(value);
  switch(type) {
  case 'object':
    if (match.date.$test(value))
      type = 'timestamp';
    break;
  case 'number':
    if (value === Math.floor(value))
      type = 'integer';
    else
      type = 'double precision';
    break;
  }
  return jsFieldToPg(col, type);
}

function jsFieldToPg(col, colSchema) {
  var defaultVal = '';
  if (typeof colSchema === 'string')
    var type = colSchema;
  else {
    var type = colSchema.type;
    if(colSchema.default)
      defaultVal = ' DEFAULT ' +colSchema.default;
  }

  switch(type) {
  case 'string':
    type = 'text';
    break;
  case 'number':
    type = 'double precision';
    break;
  case 'belongs_to':
    type = 'varchar(17)';
    break;
  case 'has_many':
    type = 'varchar(17) ARRAY';
    break;
  case 'color':
    type = 'varchar(9)';
    break;
  case 'object':
  case 'baseObject':
    type = 'jsonb';
    break;
  }
  return '"' + col + '" ' + type + defaultVal;
}

function updateSchema(table, schema) {
  var needCols = {};
  var colMap = table._colMap;
  for (var col in schema) {
    colMap.hasOwnProperty(col) ||
      (needCols[col] = jsFieldToPg(col, schema[col]));
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
        table._name + "'";
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
