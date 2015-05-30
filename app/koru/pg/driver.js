var Future = requirejs.nodeRequire('fibers/future');
var pgCursor = requirejs.nodeRequire('pg-cursor');
var pg = requirejs.nodeRequire('pg');

var koru, util, makeSubject, match;

define(function(require, exports, module) {
  koru = require('../main');
  util = require('../util');
  makeSubject = require('../make-subject');
  match = require('../match');

  koru.onunload(module, closeDefaultDb);

  var defaultDb = null;

  function closeDefaultDb() {
    defaultDb && defaultDb.close();
    defaultDb = null;
  }

  return {
    get defaultDb() {
      if (defaultDb) return defaultDb;

      return defaultDb = this.connect(module.config().url);
    },

    get defaults() {return pg.defaults},

    closeDefaultDb: closeDefaultDb,

    connect: function (url) {
      return new Client(url);
    },

    stop: function () {
      pg.end();
    },
  };
});

function getConn(url) {
  var future = new Future;
  pg.connect(url, function (err, client, done) {
    if (err) future.throw(err);
    else future.return([client, done]);
  });
  return future.wait();
}

function Client(url) {
  this._url = url;
  this._weakMap = new WeakMap;
}

Client.prototype = {
  constructor: Client,

  $inspect: function () {
    return "Pg:" + this._url;
  },

  withConn: function(func) {
    var tx = this._weakMap.get(util.thread);
    if (tx)
      return func.call(this, tx.conn);
    var conn = getConn(this._url);
    try {
      return func.call(this, conn[0]);
    } catch(ex) {
      var msg = new Error(ex.message);
      if (ex.severity) msg.severity = ex.severity;
      if (ex.code) msg.code = ex.code;
      if (ex.detail) msg.detail = ex.detail;
      if (ex.hint) msg.hint = ex.hint;
      if (ex.position) msg.position = ex.position;
      if (ex.internalPosition) msg.internalPosition = ex.internalPosition;
      if (ex.internalQuery) msg.internalQuery = ex.internalQuery;
      if (ex.where) msg.where = ex.where;
      if (ex.schema) msg.schema = ex.schema;
      if (ex.table) msg.table = ex.table;
      if (ex.column) msg.column = ex.column;
      if (ex.dataType) msg.dataType = ex.dataType;
      if (ex.constraint) msg.constraint = ex.constraint;
      if (ex.file) msg.file = ex.file;
      if (ex.line) msg.line = ex.line;
      if (ex.routine) msg.routine = ex.routine;
      throw msg;

    } finally {
      conn[1]();
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
    this.findOne('DROP TABLE IF EXISTS "' + name + '"');
  },

  transaction: function (func) {
    var tx = this._weakMap.get(util.thread);
    try {
      if (tx) {
        tx.count++;
        return func.call(this, tx.conn);
      } else {
        var conn = getConn(this._url);
        query(conn[0], 'BEGIN');
        tx = {
          count: 1,
          conn: conn[0],
          done: conn[1],
        };
        this._weakMap.set(util.thread, tx);
        return func.call(this, tx.conn);
      }
    } catch(ex) {
      if (tx) tx.rollback = true;
      throw ex;
    } finally {
      if (tx && --tx.count === 0) {
        try {
          var done = tx.done;
          query(tx.conn, tx.rollback ? 'ROLLBACK' : 'COMMIT');
        } finally {
          this._weakMap.set(util.thread, null);
          done();
        }
      }
    }
  },
};

function query(conn, text, params) {
  var future = new Future;
  conn.query(text, params, wait(future));
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
      sql += ' WHERE '+where.join(',');

    return performTransaction(this, sql, set);
  },

  where: function (where, whereValues) {
    var whereSql = [];
    var count = whereValues.length;
    for (var key in  where) {
      ++count;
      var value = where[key];
      whereSql.push('"'+key+'"=$'+count);
      whereValues.push(value);
    }
    if (whereSql.length)
      return whereSql;
  },

  query: function (where) {
    return queryWhere(this, 'SELECT * FROM "'+this._name+'"', where).rows;
  },

  findOne: function (where) {
    return queryWhere(this, 'SELECT * FROM "'+this._name+'"',
                      where, ' LIMIT 1').rows[0];
  },

  exists: function (where) {
    return queryWhere(this, 'SELECT EXISTS (SELECT 1 FROM "'+this._name+'"',
                      where, ')').rows[0].exists;
  },

  count: function (where) {
    return +queryWhere(this, 'SELECT count(*) FROM "'+this._name+'"',
                      where).rows[0].count;
  },

  remove: function (where) {
    return queryWhere(this, 'DELETE FROM "'+this._name+'"', where).rowCount;
  },
};

Table.prototype.find = Table.prototype.query;

function queryWhere(table, sql, where, suffix) {
  table._ensureTable();

  var values = [];
  where = table.where(where, values);
  if (where) {
    sql = sql+' WHERE '+where.join(',');
    if (suffix) sql += suffix;
    return table._client.query(sql, values);
  }
  if (suffix) sql += suffix;
  return table._client.query(sql);
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
      case 'jsonb':
      case 'json':
        value = wrapJsonType(value);
        break;
      }
      values[i] = value;
    } else {
      values[i] = value;
    }

    if (! desc) {
      needCols[col] = mapType(col, params[col]);
    }
  });

  return {needCols: needCols, cols: cols, values: values};
}

function wrapJsonType(value) {
  value = JSON.stringify(value);
  return {toPostgres: toPostgres};

  function toPostgres() {return value}
}

function performTransaction(table, sql, params) {
  if (table.schema || util.isObjEmpty(params.needCols)) {
    return table._client.withConn(function () {
      return this.query(sql, params.values).rowCount;
    });
  }

  return table._client.transaction(function () {
    addColumns(table, params.needCols);
    return this.query(sql, params.values).rowCount;
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
  table._columns = table._client.query(colQuery).rows;
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
