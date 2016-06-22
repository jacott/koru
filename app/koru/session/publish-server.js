define(function(require, exports, module) {
  const koru    = require('../main');
  const session = require('../session/base');
  const util    = require('../util');
  const message = require('./message');
  const publish = require('./publish-base');

  session.provide('P', subscribe);

  session.registerGlobalDictionaryAdder(module, addToDictionary);

  koru.onunload(module, function () {
    session.deregisterGlobalDictionaryAdder(module);
  });


  const pubs = publish._pubs;

  function subscribe(data) {
    const subId = data[0];
    const name = data[1];
    const subs = this._subs;
    if (! subs) return; // we are closed

    var sub = subs[subId];

    try {
      session.batchMessages();
      if (! name) {
        if (sub) {
          stopped(sub);
        }
      } else {
        var func = pubs[name];
        if (! func) {
          var msg = 'unknown publication: ' + name;
          this.sendBinary('P', [subId, 500, msg]);
          koru.info(msg);
        } else {
          sub = subs[subId] = new Sub(this, subId, func, data[2]);
          sub.resubscribe();
          subs[subId] && this.sendBinary('P', [subId]); // ready
        }
      }
      session.releaseMessages();
    } catch(ex) {
      session.abortMessages();
      throw ex;
    }
  }

  class Sub {
    constructor (conn, subId, subscribe, args) {
      this.conn = conn;
      this.id = subId;
      this._subscribe = subscribe;
      this.args = args;
      this._matches = [];
    }

    onStop (func) {
      this._stop = func;
    }

    sendUpdate (doc, changes, filter) {
      this.conn.sendUpdate(doc, changes, filter);
    }

    sendMatchUpdate (doc, changes, filter) {
      this.conn.sendMatchUpdate(doc, changes, filter);
    }

    match (modelName, func) {
      this._matches.push(this.conn.match.register(modelName, func));
    }

    error (error) {
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
    }

    stop () {
      this.conn.sendBinary('P', [this.id, false]);
      stopped(this);
    }

    setUserId (userId) {
      this.conn.userId = userId;
    }

    resubscribe () {
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
    }

    get userId() {return this.conn.userId}
  };

  function stopped(sub) {
    if (sub.conn._subs) delete sub.conn._subs[sub.id];
    sub._stop && sub._stop();
    util.forEach(sub._matches, m => m.stop());
    sub._matches = [];
    sub.stopped = true;
  }

  function addToDictionary(adder) {
    for (var name in publish._pubs) {
      adder(name);
    }
  }


  return publish;
});
