define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');

  util.extend(util, {
    reverseExtend: function (obj, properties, exclude) {
      for(var prop in properties) {
        if (exclude && prop in exclude) continue;
        if (! (prop in obj))
          Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
      }
      return obj;
    },

    extractError: function (ex) {
      var st = stacktrace(ex);
      return ex.toString() + "\n" + (st ? st.join("\n") : util.inspect(ex));
    },
    stacktrace: stacktrace,

    slice: function (list, from, to) {
      return Array.prototype.slice.call(list, from, to);
    },

    colorToArray: colorToArray,

    setNestedHash: function (value, hash /*, keys */) {
      var last = arguments.length-1;
      for(var i = 2; i < last; ++i) {
        var key = arguments[i];
        hash = hash[key] || (hash[key] = {});
      }

      return hash[arguments[last]] = value;
    },

    getNestedHash: function (hash /*, keys */) {
      var last = arguments.length-1;
      for(var i = 1; i < last; ++i) {
        var key = arguments[i];
        hash = hash[key];
        if (! hash) return undefined;
      }

      return hash[arguments[last]];
    },

    deleteNestedHash: function (hash /*, keys */) {
      var last = arguments.length-1;
      var prevs = [];
      for(var i = 1; i < last; ++i) {
        var key = arguments[i];
        prevs.push(hash);
        hash = hash[key];
        if (! hash) return undefined;
      }
      prevs.push(hash);

      var value = hash[arguments[last]];
      delete hash[arguments[last]];

      for(var i = prevs.length - 1; i >0; --i) {
        for (var noop in prevs[i]) {
          return value;
        }
        delete prevs[i-1][arguments[--last]];
      }
      return value;
    },

    withDateNow: function (date, func) {
      date = +date;
      var thread = util.thread;
      var dates = thread.dates || (thread.dates = []);
      dates.push(thread.date);
      thread.date = date;
      try {
        return func();
      } finally {
        thread.date = dates.pop();
      }
    },

    dateNow: function () {
      return util.thread.date || Date.now();
    },

    newDate: function () {
      return new Date(util.dateNow());
    },
  });

  if (isClient) {
    util.thread = {};
    util.Fiber = function(func) {return {run: func}};
  } else {
    util.Fiber = requirejs('fibers');
    Object.defineProperty(util, 'thread', {get: function () {
      return util.Fiber.current ? (util.Fiber.current.appThread || (util.Fiber.current.appThread = {})) : {};
    }});
  }

  return util;
});


function colorToArray(color) {
  if (typeof color !== 'string') return color;
  var result = [];
  var m = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt('0x'+m[i]));
    }
    result.push(m[4] ? Math.round(parseInt('0x'+m[i])*100/256)/100 : 1);
    return result;
  }
  m = /^\s*rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\s*\)\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt(m[i]));
    }
    result.push(m[4] ? parseFloat(m[i]) : 1);
    return result;
  }
  m = /^\s*#([\da-f])([\da-f])([\da-f])\s*$/.exec(color);
  if (m) {
    for(var i = 1; i < 4; ++i) {
      result.push(parseInt('0x'+m[i]+m[i]));
    }
    result.push(1);
    return result;
  }
}
