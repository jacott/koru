var Future = require('fibers/future'), wait = Future.wait;
var MongoClient = require('mongodb').MongoClient;
var connect = Future.wrap(MongoClient.connect);


define(function(require, exports, module) {
  return {
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
    this._col.insert(doc, {safe: true}, function (err, result) {
      if (err) future.throw(err);
      future.return(result);
    });
    return future.wait();
  },


  remove: function (query, options) {
    var future = new Future;
    this._col.remove(query, options, function (err, result) {
      if (err) future.throw(err);
      future.return(result);
    });
    return future.wait();
  },
};
