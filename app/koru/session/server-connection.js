define(function(require, exports, module) {
  const IdleCheck    = require('../idle-check').singleton;
  const koru         = require('../main');
  const util         = require('../util');
  const match        = require('./match');
  const message      = require('./message');
  const makeSubject  = require('koru/make-subject');

  exports = function (session) {
    const binaryData = {binary: true};

    class Connection {
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
        }
        this._last = null;
        this.match = match();

        ws.on('close', () => this.close());
      }

      onClose (func) {
        var subj = this._onClose || (this._onClose = makeSubject({}));
        return subj.onChange(func);
      }

      onMessage (data, flags) {
        var conn = this;
        if (conn._last) {
          conn._last = conn._last[1] = [data];
          return;
        }
        var current = conn._last = [data];
        IdleCheck.inc();
        var thread = util.thread;

        while(current) {
          session._onMessage(conn, current[0]);
          current = current[1];
        }
        conn._last = null;
        IdleCheck.dec();
      }

      send (type, data) {
        try {
          this.ws && this.ws.send(type + (data === undefined ? '' : data));
        } catch(ex) {
          koru.info('send exception', ex);
          this.close();
        }
      }

      sendBinary (type, args, func) {
        var bm = util.thread.batchMessage;
        if (bm) {
          bm.batch(this, type, args, func);
          return;
        }
        var msg = arguments.length === 1 ? type : message.encodeMessage(type, func ? func(args) : args, session.globalDict);
        try {
          this.ws && this.ws.send(msg, binaryData);
        } catch(ex) {
          koru.info('sendBinary exception', ex);

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
        this.send('VS', userId || '');
        var subs = this._subs;
        for(var key in subs) {
          subs[key].resubscribe();
        }
        this.send('VC');
      }

      get userId() {return this._userId}
    };

    return Connection;
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

  exports.filterAttrs = filterAttrs;

  return exports;
});
