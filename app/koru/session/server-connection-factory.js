define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');
  const IdleCheck   = require('../idle-check').singleton;
  const koru        = require('../main');
  const util        = require('../util');
  const match       = require('./match');
  const message     = require('./message');
  const crypto      = requirejs.nodeRequire('crypto');

  class ServerConnectionBase {
    constructor (ws, sessId, close) {
      this.ws = ws;
      this.sessId = sessId;
      this._subs = Object.create(null);
      this._onClose = null;
      this.close = () => {
        if (this._onClose) {
          this._onClose.notify(this);
          this._onClose = null;
        }
        var subs = this._subs;
        this._subs = null;
        this.ws = null;
        if (subs) for(var key in subs) {
          try {subs[key].stop();}
          catch(ex) {koru.error(util.extractError(ex));}
        }
        close();
      };
      this._last = null;
      this.match = match();
      this.sessAuth = null;

      ws.on('close', () => this.close());
    }

    onClose (func) {
      var subj = this._onClose || (this._onClose = makeSubject({}));
      return subj.onChange(func);
    }

    send (type, data) {
      try {
        this.ws && this.ws.send(type + (data === undefined ? '' : data));
      } catch(ex) {
        koru.info('send exception', ex);
        this.close();
      }
    }

    sendUpdate (doc, changes, filter) {
      if (changes == null)
        this.added(doc.constructor.modelName, doc._id, doc.attributes, filter);
      else if (doc == null)
        this.removed(changes.constructor.modelName, changes._id);
      else {
        this.changed(doc.constructor.modelName, doc._id, doc.$asChanges(changes), filter);
      }
    }

    sendMatchUpdate (doc, changes, filter) {
      if (doc && this.match.has(doc)) {
        if (changes && this.match.has(doc.$withChanges(changes))) {
          this.changed(doc.constructor.modelName, doc._id, doc.$asChanges(changes), filter);
          return 'changed';
        } else {
          this.added(doc.constructor.modelName, doc._id, doc.attributes, filter);
          return 'added';
        }
      } else if (changes && this.match.has(doc ? doc.$withChanges(changes) : changes)) {
        this.removed((doc||changes).constructor.modelName, (doc||changes)._id);
        return 'removed';
      }
    }

    onMessage (data, flags) {
      if (this._last) {
        this._last = this._last[1] = [data, null];
        return;
      }
      let current = this._last = [data, null];

      const process = () => {
        this._session.execWrapper(() => {
          IdleCheck.inc();
          try {
            this._session._onMessage(this, current[0]);
          } catch(ex) {
            koru.error(util.extractError(ex));
          }
          IdleCheck.dec();

          current = current[1];
          if (current)
            process();
          else {
            this._last = null;
          }
        }, this);
      };

      process();
    }

    sendBinary (type, args, func) {
      var bm = util.thread.batchMessage;
      if (bm) {
        bm.batch(this, type, args, func);
        return;
      }
      var msg = arguments.length === 1 ? type : message.encodeMessage(type, func ? func(args) : args, this._session.globalDict);
      try {
        this.ws && this.ws.send(msg, {binary: true});
      } catch(ex) {
        koru.info('sendBinary exception', ex);

        this.close();
      }
    }
    added (name, id, attrs, filter) {
      this.sendBinary('A', [name, id, filterAttrs(attrs, filter)]);
    }

    changed (name, id, attrs, filter) {
      this.sendBinary('C', [name, id, filterAttrs(attrs, filter)]);
    }

    removed (name, id) {
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
      var subs = this._subs;
      for(var key in subs) {
        subs[key].resubscribe();
      }
      this.send('VC');
    }

    get userId() {return this._userId}
  }

  function serverConnectionFactory (session) {
    class ServerConnection extends ServerConnectionBase {
      constructor (ws, sessId, close) {
        super(ws, sessId, close);
        this._session = session;
      }
    }

    return ServerConnection;
  };

  function filterAttrs(attrs, filter) {
    if (! filter) return attrs;

    var result = {};

    for(var key in attrs) {
      if (! filter.hasOwnProperty(key))
        result[key] = attrs[key];
    }

    return result;
  }

  serverConnectionFactory.ServerConnectionBase = ServerConnectionBase;
  serverConnectionFactory.filterAttrs = filterAttrs;

  module.exports = serverConnectionFactory;
});
