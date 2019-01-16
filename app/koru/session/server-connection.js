define((require, exports, module)=>{
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const Observable      = require('koru/observable');
  const BatchMessage    = require('koru/session/batch-message');
  const Match           = require('koru/session/match');
  const message         = require('koru/session/message');
  const util            = require('koru/util');
  const crypto          = requirejs.nodeRequire('crypto');

  const sideQueue$ = Symbol(), onClose$ = Symbol(), userId$ = Symbol();

  const BINARY = {binary: true};

  const filterAttrs = (attrs, filter)=>{
    if (filter === void 0) return attrs;

    const result = {};

    for(const key in attrs) {
      if (filter[key] === void 0) result[key] = attrs[key];
    }
    return result;
  };


  class ServerConnection {
    constructor(session, ws, request, sessId, close) {
      this._session = session;
      this.ws = ws;
      this.request = request;
      this.sessId = sessId;
      this[onClose$] = null;
      this.close = () => {
        const subs = this._subs;
        this._subs = null;
        this.ws = null;
        for(const key in subs) {
          try {subs[key].stop();}
          catch(ex) {koru.unhandledException(ex);}
        }
        if (this[onClose$] !== null) {
          this[onClose$].notify(this);
          this[onClose$] = null;
        }
        close();
      };
      this._subs = util.createDictionary();
      this._last = null;
      this.sessAuth = null;

      ws.on('error', err => koru.fiberConnWrapper(()=>{
        koru.info('web socket error', err);
        this.close();
      }, this));
      ws.on('close', () => koru.fiberConnWrapper(()=>this.close(), this));
    }

    onClose(func) {
      const subj = this[onClose$] || (this[onClose$] = new Observable());
      return subj.onChange(func);
    }

    send(type, data) {
      try {
        this.ws === null || this.ws.send(type + (data === void 0 ? '' : data));
      } catch(ex) {
        koru.info('send exception', ex);
        this.close();
      }
    }

    sendEncoded(msg) {
      if (this.ws === null) return;
      try {
        this.ws.send(msg, BINARY);
      } catch(ex) {
        koru.info('Websocket exception for connection: '+this.sessId, ex);
        this.close();
      }
    }

    sendUpdate(dc, filter) {
      const {doc, model: {modelName}} = dc;
      if (dc.isAdd)
        this.added(modelName, doc._id, doc.attributes, filter);
      else if (dc.isDelete)
        this.removed(modelName, doc._id);
      else  {
        this.changed(modelName, doc._id, dc.changes, filter);
      }
    }

    onMessage(data, flags) {
      if (data[0] === 'H')
        return void this.send(`K${Date.now()}`);

      if (this._last !== null) {
        this._last = this._last[1] = [data, null];
        return;
      }

      const process = current => {
        this._session.execWrapper(() => {
          IdleCheck.inc();
          try {
            this._session._onMessage(this, current[0]);
          } catch(ex) {
            koru.unhandledException(ex);
          } finally {
            IdleCheck.dec();

            const nextMsg = current[1];
            if (nextMsg)
              process(nextMsg);
            else {
              this._last = null;
            }
          }
        }, this);
      };

      process(this._last = [data, null]);
    }


    batchMessages() {
      this[sideQueue$] = [];
      return util.thread.batchMessage = new BatchMessage(this);
    }
    releaseMessages() {
      const bm = util.thread.batchMessage;
      if (bm === void 0) return;
      const sq = this[sideQueue$];
      this[sideQueue$] = void 0;
      sq !== void 0 && sq.forEach(args =>{bm.batch(this, ...args)});
      util.thread.batchMessage = void 0;
      bm.release();
    }
    abortMessages() {
      const bm = util.thread.batchMessage;
      if (bm === void 0) return;
      bm.abort();
      this.releaseMessages();
      util.thread.batchMessage = void 0;
    }

    sendBinary(type, args, func) {
      const bm = util.thread.batchMessage;
      if (this[sideQueue$] !== void 0 && (bm === void 0 || bm.conn !== this)) {
        this[sideQueue$].push([type, args, func]);
        return;
      }
      if (bm !== void 0) {
        bm.batch(this, type, args, func);
        return;
      }
      const msg = arguments.length === 1 ? type :
              message.encodeMessage(type, func ? func(args) : args, this._session.globalDict);
      try {
        this.ws && this.ws.send(msg, {binary: true});
      } catch(ex) {
        koru.info('sendBinary exception', ex);

        this.close();
      }
    }
    added(name, id, attrs, filter) {
      this.sendBinary('A', [name, id, filterAttrs(attrs, filter)]);
    }

    changed(name, id, attrs, filter) {
      this.sendBinary('C', [name, id, filterAttrs(attrs, filter)]);
    }

    removed(name, id) {
      this.sendBinary('R', [name, id]);
    }

    set userId(userId) {
      const oldId = this[userId$];
      this[userId$] = userId;
      if (! userId) userId = void 0;
      util.thread.userId = userId;
      if (userId) {
        const future = new util.Future;
        crypto.randomBytes(36, (err, ans) => {
          if (err) future.throw(err);
          else future.return(ans);
        });
        this.sessAuth = this.sessId+'|'+future.wait().toString('base64')
          .replace(/\=+$/, ''); // js2-mode doesn't like /=.../
        this.send('VS', `${userId}:${this.sessAuth}`);
      } else {
        this.send('VS', '');
        this.sessAuth = null;
      }
      const subs = this._subs;
      for(const key in subs) {
        subs[key].userIdChanged(userId, oldId);
      }
      this.send('VC');
    }

    get userId() {return this[userId$]}
  }

  ServerConnection.filterAttrs = filterAttrs;

  ServerConnection.filterDoc = (doc, filter)=>({
    _id: doc._id, constructor: doc.constructor,
    attributes: filterAttrs(doc.attributes, filter)});

  return ServerConnection;
});
