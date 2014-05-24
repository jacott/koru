define(function(require, exports, module) {
  var util = require('../util');
  var session = require('../session/server-main');
  var core = require('../core');

  session.provide('P', subscribe);

  var pubs = {};

  function publish(name, func) {
    if (name in pubs) throw new Error("Already published: " + name);
    pubs[name] = func;
  }

  util.extend(publish, {
    //test methods
    get _pubs() {return pubs},
    _destroy: function (name) {
      delete pubs[name];
    },
  });

  function subscribe(data) {
    var index = data.indexOf('[');
    var nh = (index === -1 ? data : data.slice(0,index)).toString().split('|');
    var name = nh[0];
    var subs = (this._subs = this._subs || {});
    var subId = nh[1];
    var sub = subs[nh[1]];

    if (! name) {
      if (sub) {
        sub.stop();
      }
    } else {
      var func = pubs[name];
      if (! func) {
        return core.info('unknown method: ' + name);
      }
      sub = sub || new Sub(this, subId);
      subs[subId] = sub;

      func.apply(sub, JSON.parse(data.slice(index).toString()));
    }
  }

  function Sub(conn, subId) {
    this.conn = conn;
    this.id = subId;
  }

  Sub.prototype = {
    constructor: Sub,

    onStop: function (func) {
      this._stop = func;
    },

    ready: function () {
      this.conn.ws.send('P'+this.id);
    },

    error: function (error) {
      if (error.errorType === 'BartError') {
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
  };


  return publish;
});
