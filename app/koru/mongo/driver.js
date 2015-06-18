var Future = requirejs.nodeRequire('fibers/future');
var MongoClient = require('mongodb').MongoClient;
var connect = Future.wrap(MongoClient.connect);

var util;

define(function(require, exports, module) {
  var koru = require('../main');
  util = require('../util');

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

    closeDefaultDb: closeDefaultDb,

    connect: function (url) {
      return new Connection(connect(url, {db: {native_parser: true}, server: {poolSize: 5}}).wait());
    },
  };
});

function Connection(db) {
  this._db = db;
}

Connection.prototype = {
  constructor: Connection,

  table: function (name) {
    return new Collection(this._db.collection(name));
  },

  dropTable: function (name) {
    var future = new Future;
    try {
      this._db.dropCollection(name, future.resolver());
      return future.wait();
    } catch(ex) {
      if (ex.name !== 'MongoError' || ! ex.toString().match(/not found/))
        throw ex;
    }
  },

  close: function () {
    return this._db.close();
  },
};

function Collection(col) {
  this._col = col;
  this._weakMap = new WeakMap;
}

Collection.prototype = {
  constructor: Collection,

  insert: function (doc) {
    var future = new Future;
    this._col.insert(doc, {safe: true}, future.resolver());

    return future.wait();
  },

  koruUpdate: function (doc, changes, dups) {
    this.update({_id: doc._id}, changes);
    util.isObjEmpty(dups) || this.update({_id: doc._id}, {$pull: dups});
  },

  update: function (query, changes, options) {
    query = buildQuery(query);
    var future = new Future;
    if (options)
      this._col.update(query, changes, options, future.resolver());
    else
      this._col.update(query, changes, future.resolver());

    return future.wait();
  },

  count: function (query, options) {
    query = buildQuery(query);
    var future = new Future;
    if (options)
      this._col.count(query, options, future.resolver());
    else
      this._col.count(query, future.resolver());

    return future.wait();
  },

  exists: function (query) {
    return this.count(query, {limit: 1}) !== 0;
  },

  findOne: function (query, options) {
    query = buildQuery(query);
    var future = new Future;
    if (options)
      this._col.findOne(query, options, future.resolver());
    else
      this._col.findOne(query, future.resolver());

    return future.wait();
  },

  find: function (query /*, args */) {
    query = buildQuery(query);
    return new Cursor(this._col.find.apply(this._col, arguments));
  },

  remove: function (query, options) {
    query = buildQuery(query);
    var future = new Future;
    if (options)
      this._col.remove(query, options, future.resolver());
    else
      this._col.remove(query, future.resolver());

    return future.wait();
  },

  truncate: (function () {
    var empty = {};
    var nullf = function () {};
    return function () {
      this._col.remove(empty, nullf);
    };
  })(),

  ensureIndex: genericColFunc('ensureIndex'),
  dropAllIndexes: genericColFunc('dropAllIndexes'),
  indexInformation: genericColFunc('indexInformation'),
  rename: genericColFunc('rename'),

  transaction: function (func) {
    var tx = this._weakMap.get(util.thread);
    if (! tx) {
      tx = {
        onAbort: function (func) {
          if (! tx._onAborts) tx._onAborts = [func];
          else
            tx._onAborts.push(func);
        },
      };
      this._weakMap.set(util.thread, tx);
    }
    if (tx.transaction)
      return func.call(this, tx);

    try {
      tx.transaction = 'COMMIT';
      return func.call(this, tx);
    } catch(ex) {
      tx.transaction = 'ROLLBACK';
      if (ex !== 'abort')
        throw ex;
    } finally {
      var command = tx.transaction;
      tx.transaction = null;
      var onAborts = tx._onAborts;
      if (onAborts) {
        tx._onAborts = null;
        if (command == 'ROLLBACK')
          onAborts.forEach(function (f) {
            f();
          });
      }
    }
  },
};

function genericDbFunc(cmd) {
  return function () {
    var future = new Future;

    util.append(arguments, future.resolver());

    this._db[cmd].apply(this._db, arguments);
    return future.wait();
  };
}

function genericColFunc(cmd) {
  return function () {
    var future = new Future;

    Array.prototype.push.call(arguments, future.resolver());

    this._col[cmd].apply(this._col, arguments);
    return future.wait();
  };
}

function Cursor(mcursor) {
  this.close = function () {
    var future = new Future;
    mcursor.close(future.resolver());
    future.wait();
  };

  this._mcursor = mcursor;

  var future;

  this.next = function () {
    future = new Future;
    mcursor.nextObject(future.resolver());
    return future.wait();
  };
}

Cursor.prototype = {
  constructor: Cursor,

  sort: function (spec) {
    this._mcursor.sort(spec);
    return this;
  },

  limit: function (value) {
    this._mcursor.limit(value);
    return this;
  },

  batchSize: function (value) {
    this._mcursor.batchSize(value);
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

function buildQuery(query) {
  if (query.constructor === Object)
    return query;
  var result = {};
  var fields;
  if (query.singleId)
    result._id = query.singleId;

  query._wheres && foundIn(query._wheres, result);

  if (fields = query._whereNots) {
    var neg = {};
    foundIn(query._whereNots, neg);
    var nor = [];
    for (var key in neg) {
      var item = {};
      item[key] = neg[key];
      nor.push(item);
    }
    nor = {$nor: nor};
    if (util.isObjEmpty(result))
      result = nor;
    else
      result = {$and: [result, nor]};
  }

  if (query._whereSomes) {
    var ands = result['$and'];
    if (! ands) {
      if (util.isObjEmpty(result))
        result = {$and: ands = []};
      else
        result = {$and: ands = [result]};
    }
    var somes = query._whereSomes.map(function (ors) {
      ands.push({$or: ors.map(function (fields) {
        return foundIn(fields, {});
      })});
    });
  }

  return result;

  function foundIn(fields, result) {
    for(var key in fields) {
      var value = fields[key];
      if (key[0] !== '$' && Array.isArray(value))
        result[key] = {$in: value};
      else
        result[key] = value;
    }
    return result;
  }
}
