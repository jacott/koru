define((require)=>{
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const Observable      = require('koru/observable');
  const BatchMessage    = require('koru/session/batch-message');
  const util            = require('koru/util');
  const Match           = require('./match');
  const message         = require('./message');

  const crypto          = requirejs.nodeRequire('crypto');

  const sideQueue$ = Symbol();

  const BINARY = {binary: true};

  class Base {
    constructor(ws, request, sessId, close) {
      this.ws = ws;
      this.request = request;
      this.sessId = sessId;
      // FIXME move _subs out of here to Publication
      this._subs = Object.create(null);
      this._onClose = null;
      this.close = () => {
        if (this._onClose !== null) {
          this._onClose.notify(this);
          this._onClose = null;
        }
        const subs = this._subs;
        this._subs = null;
        this.ws = null;
        if (subs) for(const key in subs) {
          try {subs[key].stop();}
          catch(ex) {koru.unhandledException(ex);}
        }
        close();
      };
      this._last = null;
      this.match = new Match();
      this.sessAuth = null;

      ws.on('error', err => koru.fiberConnWrapper(()=>{
        koru.info('web socket error', err);
        this.close();
      }, this));
      ws.on('close', () => koru.fiberConnWrapper(()=>this.close(), this));
    }

    onClose(func) {
      const subj = this._onClose || (this._onClose = new Observable());
      return subj.onChange(func);
    }

    send(type, data) {
      try {
        this.ws === null || this.ws.send(type + (data === undefined ? '' : data));
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

    sendMatchUpdate(dc, filter) {
      const {doc, model: {modelName}} = dc;
      if (dc.isDelete) {
        if (this.match.has(doc)) {
          this.removed(modelName, doc._id);
          return 'removed';
        }
      } else if (dc.isChange && this.match.has(dc.was)) {
        this.changed(modelName, doc._id, dc.changes, filter);
        return 'changed';
      } else if (this.match.has(doc)) {
        this.added(modelName, doc._id, doc.attributes, filter);
        return 'added';
      }
    }

    onMessage(data, flags) {
      if (data[0] === 'H')
        return void this.send(`K${Date.now()}`);

      if (this._last) {
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
      if (bm === undefined) return;
      const sq = this[sideQueue$];
      this[sideQueue$] = undefined;
      sq !== undefined && sq.forEach(args =>{bm.batch(this, ...args)});
      util.thread.batchMessage = undefined;
      bm.release();
    }
    abortMessages() {
      const bm = util.thread.batchMessage;
      if (bm === undefined) return;
      bm.abort();
      this.releaseMessages();
      util.thread.batchMessage = undefined;
    }

    sendBinary(type, args, func) {
      const bm = util.thread.batchMessage;
      if (this[sideQueue$] !== undefined && (bm === undefined || bm.conn !== this)) {
        this[sideQueue$].push([type, args, func]);
        return;
      }
      if (bm !== undefined) {
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
      this._userId = userId;
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
        subs[key].resubscribe();
      }
      this.send('VC');
    }

    get userId() {return this._userId}
  }

  const serverConnectionFactory = session =>{
    class ServerConnection extends Base {
      constructor (ws, request, sessId, close) {
        super(ws, request, sessId, close);
        this._session = session;
      }
    }

    return ServerConnection;
  };

  const filterAttrs = (attrs, filter)=>{
    if (! filter) return attrs;

    const result = {};

    for(const key in attrs) {
      if (filter[key] === undefined)
        result[key] = attrs[key];
    }
    return result;
  };

  serverConnectionFactory.Base = Base;
  serverConnectionFactory.filterAttrs = filterAttrs;

  return serverConnectionFactory;
});
