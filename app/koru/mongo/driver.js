var Future = requirejs.nodeRequire('fibers/future');
var MongoClient = requirejs.nodeRequire('mongodb').MongoClient;
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
}

Collection.prototype = {
  constructor: Collection,

  insert: function (doc) {
    var future = new Future;
    this._col.insert(doc, {safe: true}, future.resolver());

    return future.wait();
  },

  update: function (query, changes, options) {
    var future = new Future;
    if (options)
      this._col.update(query, changes, options, future.resolver());
    else
      this._col.update(query, changes, future.resolver());

    return future.wait();
  },

  count: function (query, options) {
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
    var future = new Future;
    if (options)
      this._col.findOne(query, options, future.resolver());
    else
      this._col.findOne(query, future.resolver());

    return future.wait();
  },

  find: function (/* args */) {
    return new Cursor(this._col.find.apply(this._col, arguments));
  },

  remove: function (query, options) {
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
    for(var doc = this.next(); doc; doc = this.next()) {
      func(doc);
    }
  },
};
