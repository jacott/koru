define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var message = require('./message');
  var match = require('./match');
  var IdleCheck = require('../idle-check').singleton;
  var makeSubject = require('koru/make-subject');

  exports = function (session) {
    function Connection(ws, sessId, close) {
      var conn = this;
      conn.ws = ws;
      conn.sessId = sessId;
      conn._subs = Object.create(null);
      conn.close = function () {
        if (conn._onClose) {
          conn._onClose.notify(conn);
          conn._onClose = null;
        }
        var subs = conn._subs;
        conn._subs = null;
        conn.ws = null;
        if (subs) for(var key in subs) {
          try {subs[key].stop();}
          catch(ex) {koru.error(util.extractError(ex));}
        }
        close();
      };
      conn._last = null;
      conn.match = match();

      ws.on('close', function () {conn.close()});
    }

    var binaryData = {binary: true};

    function batchMessage(type, args, func) {
    }

    Connection.prototype = {
      constructor: Connection,

      onClose: function (func) {
        var subj = this._onClose || (this._onClose = makeSubject({}));
        return subj.onChange(func);
      },

      onMessage: function (data, flags) {
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
      },

      send: function (type, data) {
        try {
          this.ws && this.ws.send(type + (data === undefined ? '' : data));
        } catch(ex) {
          koru.info('send exception', ex);
          this.close();
        }
      },

      sendBinary: function (type, args, func) {
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
      },

      sendUpdate: function (doc, changes, filter) {
        if (changes == null)
          this.added(doc.constructor.modelName, doc._id, doc.attributes, filter);
        else if (doc == null)
          this.removed(changes.constructor.modelName, changes._id);
        else {
          this.changed(doc.constructor.modelName, doc._id, doc.$asChanges(changes), filter);
        }
      },

      sendMatchUpdate: function (doc, changes, filter) {
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
      },

      added: function (name, id, attrs, filter) {
        this.sendBinary('A', [name, id, filterAttrs(attrs, filter)]);
      },

      changed: function (name, id, attrs, filter) {
        this.sendBinary('C', [name, id, filterAttrs(attrs, filter)]);
      },

      removed: function (name, id) {
        this.sendBinary('R', [name, id]);
      },

      set userId(userId) {
        this._userId = userId;
        util.thread.userId = userId;
        this.send('VS', userId || '');
        var subs = this._subs;
        for(var key in subs) {
          subs[key].resubscribe();
        }
        this.send('VC');
      },

      get userId() {return this._userId},
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
