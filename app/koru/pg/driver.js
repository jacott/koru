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
      conn.query(text, params, wait(future));
      return future.wait().rows;
    });
  },

  collection: function (name) {
    return new Collection(name, this);
  },

  dropCollection: function (name) {
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

function Collection(name, client) {
  this._name = name;
  this._client = client;
}

function getColQuery(name) {
  return "SELECT * FROM information_schema.columns WHERE table_name = '" + name + "'";
}

Collection.prototype = {
  constructor: Collection,

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

  insert: function (params) {
    this._ensureTable();
    var needCols = {};
    var cols = Object.keys(params);
    var values = new Array(cols.length);
    var colMap = this._colMap;

    util.forEach(cols, function (col, i) {
      var value = params[col];
      values[i] = value;

      if (! colMap.hasOwnProperty(col)) {
        needCols[col] = mapType(col, params[col]);
      }
    });

    var ins = 'INSERT INTO "'+this._name+'" ('+cols.join(',')+') values (' +
          cols.map(function (c, i) {return "$"+(i+1)}).join(",")+')';

    if (util.isObjEmpty(needCols)) {
      return this._client.withConn(function (client) {
        return this.queryOne(ins, values);
      });
    }

    var prefix = 'ALTER TABLE "'+this._name+'" ADD COLUMN ';
    var colQuery = getColQuery(this._name);

    var col = this;

    return this._client.transaction(function () {
      this.query(Object.keys(needCols).map(function (col) {
        return prefix + needCols[col];
      }).join(';'));

      col._columns = this.query(colQuery);
      col._colMap = util.toMap('column_name', null, col._columns);
      return this.queryOne(ins, values);
    });
  },

  update: function (query, params) {
    this._ensureTable();
    return 2;
  },

  query: function (where) {
    this._ensureTable();
    var whereSql = [];
    var whereValues = [];
    var count = 0;
    for (var key in  where) {
      ++count;
      var value = where[key];
      whereSql = '"'+key+'"=$'+count;
      whereValues.push(value);
    }

    var query = 'Select * FROM "'+this._name+'"';

    if (count === 0)
      return this._client.query(query);

    return this._client.query(query+' WHERE '+whereSql.join(','), whereValues);

  },
};

function wait(future) {
  return function (err, result) {
    if (err) future.throw(err);
    else future.return(result);
  };
}
