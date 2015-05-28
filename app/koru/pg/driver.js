var Future = requirejs.nodeRequire('fibers/future');
var pgCursor = requirejs.nodeRequire('pg-cursor');
var pg = requirejs.nodeRequire('pg');

var util, makeSubject;

define(function(require, exports, module) {
  var koru = require('../main');
  util = require('../util');
  makeSubject = require('../make-subject');

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
    } finally {
      conn[1]();
    }
  },

  queryOne: function (text, params) {
    return this.query(text, params)[0];
  },

  query: function (text, params) {
    var future = new Future;
    return this.withConn(function (conn) {
      conn.query(text, params, wait(future, text));
      return future.wait().rows;
    });
  },

  table: function (name) {
    return new Table(name, this);
  },

  dropTable: function (name) {
    this.queryOne('DROP TABLE IF EXISTS "' + name + '"');
  },

  transaction: function (func) {
    var tx = this._weakMap.get(util.thread);
    try {
      if (tx) {
        tx.count++;
        return func.call(this, tx.conn);
      } else {
        var conn = getConn(this._url);
        tx = {
          count: 1,
          conn: conn[0],
          done: conn[1],
        };
        this._weakMap.set(util.thread, tx);
        return func.call(this, tx.conn);
      }
    } catch(ex) {
      tx.rollback = true;
      throw ex;
    } finally {
      if (tx && --tx.count === 0) {
        try {
          var done = tx.done;
          tx.conn.query(tx.rollback ? 'ROLLBACK' : 'COMMIT');
        } finally {
          util.thread._$pg_transaction = null;
          done();
        }
      }
    }
  },
};

function mapType(col, value) {
  var type;
  switch(typeof(value)) {
  case 'string':
    type = 'text'; break;
  case 'number':
    type = 'integer';
    break;
  }
  return col + ' ' + type;
}

function Table(name, client) {
  this._name = name;
  this._client = client;
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
    var colQuery = getColQuery(this._name);
    this._columns = this._client.query(colQuery);
    if (this._columns.length === 0) {
      this._client.query('CREATE TABLE IF NOT EXISTS "'+this._name+'" (_id varchar(17))');
      this._columns = this._client.query(colQuery);
    }
    this._colMap = util.toMap('column_name', null, this._columns);
    this._ready = true;
    subject.notify();
  },

  transaction: function (func) {
    var col = this;
    return col._client.transaction(function () {
      return func.call(col);
    });
  },

  addColumns: function (needCols) {
    var table = this;
    var prefix = 'ALTER TABLE "'+this._name+'" ADD COLUMN ';
    var colQuery = getColQuery(this._name);
    var client = table._client;

    client.query(Object.keys(needCols).map(function (col) {
      return prefix + needCols[col];
    }).join(';'));

    table._columns = client.query(colQuery);
    table._colMap = util.toMap('column_name', null, table._columns);

  },

  insert: function (params) {
    this._ensureTable();
    params = toColumns(this, params);

    var sql = 'INSERT INTO "'+this._name+'" ('+params.cols.join(',')+') values (' +
          params.cols.map(function (c, i) {return "$"+(i+1)}).join(",")+')';

    return performTransaction(this, sql, params);
  },

  update: function (where, params) {
    this._ensureTable();

    var sql = 'UPDATE "'+this._name+'" SET ';

    var set = toColumns(this, params.$set);
    sql += set.cols.map(function (col, i) {
      return col+'=$'+(i+1);
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
    this._ensureTable();
    var sql = 'Select * FROM "'+this._name+'"';

    var values = [];

    where = this.where(where, values);
    if (where)
      return this._client.query(sql+' WHERE '+where.join(','), values);
    return this._client.query(sql);
  },

  queryOne: function (where) {
    this._ensureTable();
    var sql = 'Select * FROM "'+this._name+'"';
    var limit = " LIMIT 1";

    var values = [];

    where = this.where(where, values);
    if (where)
      return this._client.queryOne(sql+' WHERE '+where.join(',')+limit, values);
    return this._client.queryOne(sql+limit);
  },
};

function getColQuery(name) {
  return "SELECT * FROM information_schema.columns WHERE table_name = '" + name + "'";
}

function toColumns(table, params) {
  var needCols = {};
  var cols = Object.keys(params);
  var values = new Array(cols.length);
  var colMap = table._colMap;

  util.forEach(cols, function (col, i) {
    var value = params[col];
    values[i] = value;

    if (! colMap.hasOwnProperty(col)) {
      needCols[col] = mapType(col, params[col]);
    }
  });

  return {needCols: needCols, cols: cols, values: values};
}

function performTransaction(table, sql, params) {
  if (util.isObjEmpty(params.needCols)) {
    return table._client.withConn(function () {
      return this.queryOne(sql, params.values);
    });
  }

  return table._client.transaction(function () {
    table.addColumns(params.needCols);
    return this.queryOne(sql, params.values);
  });
}

function wait(future, text) {
  return function (err, result) {
    if (err) {
      if (err.message)
        err.message += '\n'+text;
      future.throw(err);
    }
    else future.return(result);
  };
}
