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

  const subscribe$ = Symbol();

  const pubs = publish._pubs;

  function subscribe(data) {
    const subId = data[0];
    const name = data[1];
    const subs = this._subs;
    if (subs == null) return; // we are closed

    let sub = subs[subId];

    this.batchMessages();
    try {
      if (name === undefined) {
        sub === undefined || stopped(sub);
      } else {
        const func = pubs[name];
        if (func === undefined) {
          const msg = 'unknown publication: ' + name;
          this.sendBinary('P', [subId, 500, msg]);
          koru.info(msg);
        } else {
          sub = subs[subId] = new Sub(this, subId, func, data[2], data[3]);
          sub.resubscribe();
          subs[subId] && this.sendBinary('P', [
            subId, 200, sub.lastSubscribed = util.dateNow()]); // ready
        }
      }
      this.releaseMessages();
    } catch(ex) {
      this.abortMessages();
      throw ex;
    }
  }

  class Sub {
    constructor(conn, subId, subscribe, args, lastSubscribed) {
      this.conn = conn;
      this.lastSubscribed = typeof lastSubscribed === 'number' ? lastSubscribed : 0;
      this.id = subId;
      this[subscribe$] = subscribe;
      this.args = args;
      this._matches = [];
    }

    onStop(func) {
      this._stop = func;
    }

    sendUpdate(doc, changes, filter) {
      this.conn.sendUpdate(doc, changes, filter);
    }

    sendMatchUpdate(doc, changes, filter) {
      this.conn.sendMatchUpdate(doc, changes, filter);
    }

    match(modelName, func) {
      this._matches.push(this.conn.match.register(modelName, func));
    }

    error(error) {
      const {id, conn} = this;
      if (conn.ws) {
        if (error.name === 'KoruError') {
          conn.sendBinary('P', [id, error.error, error.reason]);
        } else {
          conn.sendBinary('P', [id, 500, error.toString()]);
        }
      }

      stopped(this);
    }

    stop() {
      this.conn.sendBinary('P', [this.id, false]);
      stopped(this);
    }

    setUserId(userId) {
      this.conn.userId = userId;
    }

    resubscribe() {
      try {
        this.isResubscribe = this._called;
        this._stop && this._stop();
        this[subscribe$].apply(this, this.args);
      } catch(ex) {
        if (ex.error) {
          this.error(ex);
        } else {
          koru.unhandledException(ex);
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
    for (const name in publish._pubs) adder(name);
  }


  return publish;
});
