var Future = require('fibers/future');
var MongoClient = require('mongodb').MongoClient;
var connect = Future.wrap(MongoClient.connect);


define(function(require, exports, module) {
  var env = require('../env');

  env.onunload(module, closeDefaultDb);

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

  collection: function (name) {
    return new Collection(this._db.collection(name));
  },

  dropCollection: function (name) {
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

  findOne: function (query, options) {
    var future = new Future;
    if (options)
      this._col.findOne(query, options, future.resolver());
    else
      this._col.findOne(query, future.resolver());

    return future.wait();
  },

  find: function (query, options) {
    var future = new Future;
    if (options)
      this._col.find(query, options, future.resolver());
    else
      this._col.find(query, future.resolver());
    return new Cursor(future.wait());
  },

  remove: function (query, options) {
    var future = new Future;
    if (options)
      this._col.remove(query, options, future.resolver());
    else
      this._col.remove(query, future.resolver());

    return future.wait();
  },

  ensureIndex: function (keys, options) {
     var future = new Future;
    if (options)
      this._col.ensureIndex(keys, options, future.resolver());
    else
      this._col.ensureIndex(keys, future.resolver());

    return future.wait();
  },
};

function Cursor(mcursor) {
  this.close = function () {
    var future = new Future;
    mcursor.close(future.resolver());
    future.wait();
  };

  var future;

  this.next = function () {
    future = new Future;
    mcursor.nextObject(future.resolver());
    return future.wait();
  };
}
