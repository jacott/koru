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
        stopped(sub);
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

    sendUpdate: function (doc, changes, filter) {
      this.conn.sendUpdate(doc, changes, filter);
    },

    sendMatchUpdate: function (doc, changes, filter) {
      this.conn.sendMatchUpdate(doc, changes, filter);
    },

    match: function (modelName, func) {
      this._matches.push(this.conn.match.register(modelName, func));
    },

    error: function (error) {
      var id = this.id;
      var conn = this.conn;
      if (conn.ws) {
        if (error.errorType === 'KoruError') {
          conn.sendBinary('P', [id, error.error, error.reason]);
        } else {
          conn.sendBinary('P', [id, 500, error.toString()]);
        }
      }

      stopped(this);
    },

    stop: function () {
      this.conn.sendBinary('P', [this.id, false]);
      stopped(this);
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
        if (ex.error) {
          this.error(ex);
        } else {
          koru.error(util.extractError(ex));
          this.error(new koru.Error(500, 'Internal server error'));
        }
      }
      this._called = true;
      this.isResubscribe = false;
    },

    get userId() {
      return this.conn.userId;
    }
  };

  function stopped(sub) {
    if (sub.conn._subs) delete sub.conn._subs[sub.id];
    sub._stop && sub._stop();
    util.forEach(sub._matches, function (m) {
      m.stop();
    });
    sub._matches = [];
    sub.stopped = true;
  }

  return publish;
});
