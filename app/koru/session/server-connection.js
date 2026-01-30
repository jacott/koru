define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const TransQueue      = require('koru/model/trans-queue');
  const Observable      = require('koru/observable');
  const message         = require('koru/session/message');
  const util            = require('koru/util');

  const crypto = requirejs.nodeRequire('crypto');

  const onClose$ = Symbol(), batch$ = Symbol(), userId$ = Symbol();

  const BINARY = {binary: true};

  const filterAttrs = (attrs, filter) => {
    if (filter === undefined) return attrs;

    const result = {};

    for (const key in attrs) {
      if (filter[key] === undefined) result[key] = attrs[key];
    }
    return result;
  };

  const startBatch = (conn, map, thread) => {
    const {push, encode} = message.openEncoder('W', conn._session.globalDict);

    map.set(thread, push);

    const finish = () => {
      map.delete(thread);
      if (map.size == 0) conn[batch$] = null;
    };

    TransQueue.onSuccess(() => {
      finish();
      conn.sendEncoded(encode());
    });
    TransQueue.onAbort(finish);

    return push;
  };

  class ServerConnection {
    engine;
    remoteAddress;
    constructor(session, ws, request, sessId, close) {
      this._session = session;
      this.ws = ws;
      this.request = request;
      this.sessId = sessId;
      this[onClose$] = null;
      this[userId$] = session.DEFAULT_USER_ID;
      this.close = () => {
        const subs = this._subs;
        this._subs = null;
        this.ws = null;
        for (const key in subs) {
          try {
            subs[key].stop();
          } catch (ex) {
            koru.unhandledException(ex);
          }
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
      this[batch$] = null;

      ws.on('error', (err) =>
        koru.fiberConnWrapper(() => {
          koru.info('web socket error', err);
          this.close();
        }, this));
      ws.on('close', () => koru.fiberConnWrapper(() => this.close(), this));
    }

    onClose(func) {
      const subj = this[onClose$] || (this[onClose$] = new Observable());
      return subj.onChange(func);
    }

    send(type, data) {
      try {
        this.ws === null || this.ws.send(type + (data === undefined ? '' : data));
      } catch (ex) {
        koru.info('send exception', ex);
        this.close();
      }
    }

    sendEncoded(msg) {
      if (this.ws === null) return;
      try {
        this.ws.send(msg, BINARY);
      } catch (ex) {
        koru.info('Websocket exception for connection: ' + this.sessId, ex);
        this.close();
      }
    }

    encodeMessage(type, args) {
      return message.encodeMessage(type, args, this._session.globalDict);
    }

    sendBinary(type, data) {
      this.sendEncoded(data === undefined ? type : this.encodeMessage(type, data));
    }

    batchMessage(type, data) {
      if (!TransQueue.isInTransaction()) {
        throw new Error('batchMessage called when not in transaction');
      }

      const map = this[batch$] || (this[batch$] = new Map());
      const {thread} = util;
      (map.get(thread) || startBatch(this, map, thread))([type, data]);
    }

    onMessage(data, isBinary) {
      if (!isBinary) {
        data = data.toString();
        if (data[0] === 'H') {
          return void this.send(`K${Date.now()}`);
        }
      }

      if (this._last !== null) {
        this._last = this._last[1] = [data, null];
        return;
      }

      const process = (current) =>
        this._session.execWrapper(async () => {
          IdleCheck.inc();
          try {
            await this._session._onMessage(this, current[0]);
          } catch (ex) {
            koru.unhandledException(ex);
            koru.info('Unexpected error on message: ' + current[0].slice(0, 20).toString('hex'));
          } finally {
            IdleCheck.dec();

            const nextMsg = current[1];
            if (nextMsg) {
              process(nextMsg);
            } else {
              this._last = null;
            }
          }
        }, this);

      return process(this._last = [data, null]);
    }

    added(name, attrs, filter) {
      this.sendBinary('A', [name, filterAttrs(attrs, filter)]);
    }

    changed(name, id, attrs, filter) {
      this.sendBinary('C', [name, id, filterAttrs(attrs, filter)]);
    }

    removed(name, id, flag) {
      this.sendBinary('R', [name, id, flag]);
    }

    async setUserId(userId) {
      userId ??= undefined;
      const oldId = this[userId$];
      if (!userId) userId = this._session.DEFAULT_USER_ID;
      this[userId$] = userId;
      util.thread.userId = userId;
      if (userId !== this._session.DEFAULT_USER_ID) {
        const bytes = await new Promise((resolve, reject) => {
          crypto.randomBytes(36, (err, ans) => {
            if (err) {
              reject(err);
            } else {
              resolve(ans);
            }
          });
        });
        this.sessAuth = this.sessId + '|' + bytes.toString('base64').replace(/\=+$/, ''); // js2-mode doesn't like /=.../
        this.send('VS', `${userId}:${this.sessAuth}:${util.thread.dbId ?? 'default'}`);
      } else {
        this.send('VS', '');
        this.sessAuth = null;
      }
      const subs = this._subs;
      for (const key in subs) {
        await subs[key].userIdChanged(userId, oldId);
      }
      this.send('VC');
    }

    get userId() {
      return this[userId$];
    }
    set userId(v) {
      throw new Error('use setUserId');
    }

    static buildUpdate(dc) {
      const {doc, model: {modelName}} = dc;
      if (dc.isAdd) {
        return ['A', [modelName, doc.attributes]];
      } else if (dc.isDelete) {
        return ['R', [modelName, doc._id, dc.flag]];
      } else {
        return ['C', [modelName, doc._id, dc.changes]];
      }
    }
  }

  ServerConnection.filterAttrs = filterAttrs;

  ServerConnection.filterDoc = (doc, filter) => ({
    _id: doc._id,
    constructor: doc.constructor,
    attributes: filterAttrs(doc.attributes, filter),
  });

  return ServerConnection;
});
