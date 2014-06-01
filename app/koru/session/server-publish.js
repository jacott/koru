define(function(require, exports, module) {
  var util = require('../util');
  var session = require('../session/server-main');
  var env = require('../env');
  var publish = require('./publish-base');

  session.provide('P', subscribe);

  var pubs = publish._pubs;

  function subscribe(data) {
    var index = data.indexOf('[');
    var nh = (index === -1 ? data : data.slice(0,index)).toString().split('|');
    var name = nh[0];
    var subs = this._subs;
    var subId = nh[1];
    var sub = subs[nh[1]];

    if (! name) {
      if (sub) {
        sub.stop();
      }
    } else {
      var func = pubs[name];
      if (! func) {
        var msg = 'unknown publication: ' + name;
        this.ws.send('P'+subId+'|500|'+msg);
        return env.info(msg);
      }
      sub = subs[subId] = new Sub(this, subId, func, JSON.parse(data.slice(index).toString()));
      sub.resubscribe();
    }
  }

  function Sub(conn, subId, subscribe, args) {
    this.conn = conn;
    this.id = subId;
    this._subscribe = subscribe;
    this._args = args;
  }

  Sub.prototype = {
    constructor: Sub,

    onStop: function (func) {
      this._stop = func;
    },

    ready: function () {
      this.conn.ws.send('P'+this.id);
    },

    sendUpdate: function (doc, changes) {
      if (changes == null)
        this.conn.added(doc.constructor.modelName, doc._id, doc.attributes);
      else if (doc == null)
        this.conn.removed(changes.constructor.modelName, changes._id);
      else
        this.conn.changed(doc.constructor.modelName, doc._id, util.extractViaKeys(changes, doc.attributes));
    },

    error: function (error) {
      if (error.errorType === 'KoruError') {
        this.conn.ws.send('P'+this.id+'|'+error.error+'|'+error.reason);
      } else {
        this.conn.ws.send('P'+this.id+'|500|'+error.toString());
      }

      delete this.conn._subs[this.id];
    },

    stop: function () {
      delete this.conn._subs[this.id];
      this._stop && this._stop();
    },

    setUserId: function (userId) {
      this.conn.userId = userId;
    },

    resubscribe: function () {
      try {
        this._stop && this._stop();
        this._subscribe.apply(this, this._args);
      } catch(ex) {
        env.error(util.extractError(ex));
        this.error(new env.Error(500, 'Internal server error'));
      }
    },

    get userId() {
      return this.conn.userId;
    }
  };


  return publish;
});
