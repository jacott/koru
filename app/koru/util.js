define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');

  var valueUndefined = {value: undefined};

  util.extend(util, {
    reverseExtend: function (obj, properties, exclude) {
      for(var prop in properties) {
        if (exclude && prop in exclude) continue;
        if (! (prop in obj))
          Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties, prop));
      }
      return obj;
    },

    extendWithDelete: function(obj, properties) {
      for(var prop in properties) {
        var value = Object.getOwnPropertyDescriptor(properties, prop);
        if (value.value === undefined)
          delete obj[prop];
        else
          Object.defineProperty(obj,prop, value);
      }
      return obj;
    },

    swapWithDelete: function(obj, properties) {
      for(var prop in properties) {
        var nv = Object.getOwnPropertyDescriptor(properties, prop);
        var ov = Object.getOwnPropertyDescriptor(obj, prop);
        if (nv.value === undefined)
          delete obj[prop];
        else
          Object.defineProperty(obj, prop, nv);
        Object.defineProperty(properties, prop, ov ? ov : valueUndefined);
      }
      return obj;
    },

    /**
     * Use the keys or {keys} to extract the values from {attrs}.
     *
     * @returns new hash of extracted values.
     */
    extractViaKeys: function (keys, attrs) {
      var result = {};
      for(var key in keys) {
        result[key] = attrs[key];
      }
      return result;
    },

    /**
     * includesAttributes will check each key in attrs against the
     * list of docs. The first docs to have the key will be used in
     * the equality check. In this changes can be tested by passing
     * the arguments: includesAttributes(attrs, changes, doc)
     */
    includesAttributes: function (attrs/*, docs */) {
      for(var key in attrs) {
        var match = false;
        for(var i = 1; i < arguments.length; ++i) {
          var doc = arguments[i];
          if (key in doc) {
            if (doc[key] != attrs[key])
              return false;
            match = true;
            break;
          }
        }
        if (! match) return false;
      }

      return true;
    },

    extractError: function (ex) {
      var st = stacktrace(ex);
      return ex.toString() + "\n" + (st ? st.join("\n") : util.inspect(ex));
    },
    stacktrace: stacktrace,

    slice: function (list, from, to) {
      return Array.prototype.slice.call(list, from, to);
    },

    values: function (map) {
      var result = [];
      for(var key in map) result.push(map[key]);
      return result;
    },

    mapField: function (list, fieldName) {
      fieldName = fieldName || '_id';
      return list && list.map(function (doc) {
        return doc[fieldName];
      });
    },

    /** Does not deep copy functions */
    deepCopy: function (orig) {
      switch(typeof orig) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'undefined':
      case 'function':
        return orig;
      }

      if (orig === null) return orig;

      switch(Object.prototype.toString.call(orig)) {
      case "[object Date]":
        return new Date(orig.getTime());
      case "[object Array]":
        return orig.map(function (item) {
          return util.deepCopy(item);
        });
      }

      var result = {};
      for(var key in orig) {
        result[key] = util.deepCopy(orig[key]);
      }

      return result;
    },

    humanize: function (name) {
      name = this.uncapitalize(name);
      return name.replace(/_id$/,'').replace(/[_-]/g,' ').replace(/([A-Z])/g, function (_, m1) {
        return ' '+m1.toLowerCase();
      });
    },

    initials: function (name, count) {
      count = count || 3;

      name = (name || '').split(' ');
      var result = '';
      for(var i=0;count > 1 && i < name.length -1;++i, --count) {
        result += name[i].slice(0,1);
      }
      if (count > 0 && name.length > 0)
        result += name[name.length-1].slice(0,1);

      return result.toUpperCase();
    },

    dasherize: function (name) {
      return this.humanize(name).replace(/[\s_]+/g,'-');
    },

    labelize: function (name) {
      return this.capitalize(this.humanize(name));
    },

    sansId: function (name) {
      return name.replace(/_ids?$/,'');
    },

    capitalize: function (value) {
      if(value == null || value === '')
        return '';

      return value.substring(0,1).toUpperCase() + value.substring(1);
    },

    uncapitalize: function (value) {
      if(value == null || value === '')
        return '';

      return value.substring(0,1).toLowerCase() + value.substring(1);
    },

    titleize: function (value) {
      return this.capitalize(value.replace(/[-._%+A-Z]\w/g, function (w) {
        return ' ' + util.capitalize(w.replace(/^[-._%+]/,''));
      }).trim());
    },


    camelize: function (value) {
      return value.replace(/[-._%+A-Z]\w/g, function (w) {
        return util.capitalize(w.replace(/^[-._%+]/,''));
      });
    },

    compareByName: function (a, b) {
      return a.name === b.name ? 0 : a.name < b.name ? -1 : 1;
    },

    compareByField: function (field) {
      return function (a, b) {
        var afield = a[field], bfield = b[field];
        return a[field] === b[field] ? 0 : a[field] < b[field] ? -1 : 1;
      };
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
