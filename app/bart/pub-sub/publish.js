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
    var sub = subs[nh[1]];

    if (! name) {
      if (sub) {
        delete subs[nh[1]];
        sub._stop && sub._stop.call(sub);
      }
    } else {
      var func = pubs[name];
      if (! func) {
        return core.info('unknown method: ' + name);
      }
      sub = sub || new Sub(this);
      subs[nh[1]] = sub;

      func.apply(sub, JSON.parse(data.slice(index).toString()));
    }
  }

  function Sub(session) {
    this.session = session;
  }

  Sub.prototype = {
    constructor: Sub,

    onStop: function (func) {
      this._stop = func;
    },
  };


  return publish;
});
