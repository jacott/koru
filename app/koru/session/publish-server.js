define(function(require, exports, module) {
  var util = require('../util');
  var session = require('../session/base');
  var koru = require('../main');
  var publish = require('./publish-base');
  var message = require('./message');

  session.provide('P', subscribe);

  var pubs = publish._pubs;

  function subscribe(data) {
    data = message.decodeMessage(data);

    var subId = data[0];
    var name = data[1];
    var subs = this._subs;
    if (! subs) return; // we are closed
    var sub = subs[subId];

    if (! name) {
      if (sub) {
        sub.stop();
      }
    } else {
      var func = pubs[name];
      if (! func) {
        var msg = 'unknown publication: ' + name;
        this.sendBinary('P', [subId, 500, msg]);
        return koru.info(msg);
      }
      sub = subs[subId] = new Sub(this, subId, func, data[2]);
      sub.resubscribe();
      subs[subId] && this.sendBinary('P', [subId]); // ready
    }
  }

  function Sub(conn, subId, subscribe, args) {
    this.conn = conn;
    this.id = subId;
    this._subscribe = subscribe;
    this.args = args;
    this._matches = [];
  }

  Sub.prototype = {
    constructor: Sub,

    onStop: function (func) {
      this._stop = func;
    },

    sendUpdate: function (doc, changes) {
      if (changes == null)
        this.conn.added(doc.constructor.modelName, doc._id, doc.attributes);
      else if (doc == null)
        this.conn.removed(changes.constructor.modelName, changes._id);
      else
        this.conn.changed(doc.constructor.modelName, doc._id, util.extractViaKeys(changes, doc.attributes));
    },

    sendMatchUpdate: function (doc, changes) {
      var conn = this.conn;
      if (doc && conn.match.has(doc)) {
        if (changes && conn.match.has(doc.$asBefore(changes)))
          conn.changed(doc.constructor.modelName, doc._id, util.extractViaKeys(changes, doc.attributes));
        else
          conn.added(doc.constructor.modelName, doc._id, doc.attributes);
      } else if (changes && conn.match.has(doc ? doc.$asBefore(changes) : changes))
        conn.removed((doc||changes).constructor.modelName, (doc||changes)._id);
    },

    match: function (modelName, func) {
      this._matches.push(this.conn.match.register(modelName, func));
    },

    error: function (error) {
      if (error.errorType === 'KoruError') {
        this.conn.sendBinary('P', [this.id, error.error, error.reason]);
      } else {
        this.conn.sendBinary('P', [this.id, 500, error.toString()]);
      }

      delete this.conn._subs[this.id];
    },

    stop: function () {
      if (this.conn._subs) delete this.conn._subs[this.id];
      this._stop && this._stop();
      this._matches.forEach(function (m) {
        m.stop();
      });
      this._matches = [];
    },

    setUserId: function (userId) {
      this.conn.userId = userId;
    },

    resubscribe: function () {
      try {
        this.isResubscribe = this._called;
        this._stop && this._stop();
        this._subscribe.apply(this, this.args);
      } catch(ex) {
        koru.error(util.extractError(ex));
        this.error(new koru.Error(500, 'Internal server error'));
      }
      this._called = true;
      this.isResubscribe = false;
    },

    get userId() {
      return this.conn.userId;
    }
  };


  return publish;
});
