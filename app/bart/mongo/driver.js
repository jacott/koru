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
    var db = this._db;
    try {
      wait(function (future) {
        db.dropCollection(name, future);
      });
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

function wait(func) {
  var future = new Future;
  func(callback);

  return future.wait();

  function callback(err, result) {
    if (err) {
      future.throw(err);
    } else {
      future.return(result);
    }
  }
}

Collection.prototype = {
  constructor: Collection,

  insert: function (doc) {
    var col = this._col;
    return wait(function (future) {
      col.insert(doc, {safe: true}, future);
    });
  },

  update: function (query, changes, options) {
    var col = this._col;
    return wait(function (future) {
      if (options)
        col.update(query, changes, options, future);
      else
        col.update(query, changes, future);
    });
  },

  count: function (query, options) {
    var col = this._col;
    return wait(function (future) {
      if (options)
        col.count(query, options, future);
      else
        col.count(query, future);
    });
  },

  findOne: function (query, options) {
    var col = this._col;
    return wait(function (future) {
      if (options)
        col.findOne(query, options, future);
      else
        col.findOne(query, future);
    });
  },
  find: function (query, options) {
    var col = this._col;
    return new Cursor(wait(function (future) {
      if (options)
        col.find(query, options, future);
      else
        col.find(query, future);
    }));
  },

  remove: function (query, options) {
    var col = this._col;
    return wait(function (future) {
      if (options)
        col.remove(query, options, future);
      else
        col.remove(query, future);
    });
  },
};

function Cursor(mcursor) {
  this.close = function () {
    return wait(function (future) {
      mcursor.close(future);
    });
  };

  var future;

  this.next = function () {
    future = new Future;
    mcursor.nextObject(nextCallback);
    return future.wait();
  };

  function nextCallback(err, doc) {
    if (err) {
      future.throw(err);
    } else {
      future.return(doc);
    }
  }
}
