define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');

  var valueUndefined = {value: undefined};

  util.extend(util, {
    EMAIL_RE: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,

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

    /**
     * Fixes NaN === NaN (should be true) and
     * -0 === +0 (should be false)
     *  http://wiki.ecmascript.org/doku.php?id=harmony:egal
     */
    egal: egal,

    /**
     * Only for undefined, null, number, string, boolean, date, array
     * and object. All the immutable types are compared with
     * egal. Dates are compared via getTime. Array and Object
     * enumerables with deepEqual.
     *
     * Any other types will always return false.
     */
    deepEqual: deepEqual,

    lookupDottedValue: function (key, attributes) {
      var parts = key.split('.');
      var val = attributes[parts[0]];
      for(var i=1; val && i < parts.length;++i) {
        val = val[parts[i]];
      }
      return val;
    },

    applyChanges: function (attrs, changes) {
      for(var key in changes) {
        var nv = Object.getOwnPropertyDescriptor(changes, key);
        var ov = util.applyChange(attrs, key, nv);
        if (deepEqual(nv.value, ov.value))
          delete changes[key];
        else
          Object.defineProperty(changes, key, ov);
      }

      return attrs;
    },

    applyChange: function (attrs, key, nv) {
      var index = key.indexOf(".");

      if (index === -1) {
        var ov = Object.getOwnPropertyDescriptor(attrs, key);
        if (nv.value === undefined)
          delete attrs[key];
        else
          Object.defineProperty(attrs, key, nv);

      } else { // update part of attribute
        var ov, parts = key.split(".");
        var curr = attrs;
        for(var i = 0; i < parts.length - 1; ++i) {
          var part = parts[i];
          if (isArray(curr)) {
            part = +parts[i];
            if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
          }
          curr = curr[part] || (curr[part] = {});
        }
        ov = Object.getOwnPropertyDescriptor(curr, parts[i]);
        if (nv.value === undefined)
          delete curr[parts[i]];
        else {
          if (isArray(curr)) {
            part = +parts[i];
            if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
            curr[part] = nv.value;
          } else {
            Object.defineProperty(curr, parts[i], nv);
          }
        }
      }
      return ov ? ov : valueUndefined;
    },


    /**
     * Use the keys or {keys} to extract the values from {attrs}.
     *
     * @returns new hash of extracted values.
     */
    extractViaKeys: function (keys, attrs) {
      var result = {};
      for(var key in keys) {
        result[key] = (key.indexOf(".") !== -1) ? util.lookupDottedValue(key, attrs) : attrs[key];
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

    isObjEmpty: function (obj) {
      for(var noop in obj) {return false;}
      return true;
    },

    removeItem: function (list, item) {
      var index = list.indexOf(item);
      if (index !== -1)
        list.splice(index, 1);
      return list;
    },

    values: function (map) {
      var result = [];
      for(var key in map) result.push(map[key]);
      return result;
    },

    indexOfRegex: function (list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(var i=0; i < list.length; ++i) {
        var row = list[i];
        if (value.test(row[fieldName]))
          return i;
      }
      return -1;
    },

    toMap: function (/* keyName, valueName, lists */) {
      var result = {};
      var lc = 2;
      if (arguments.length === 1) {
        lc = 0;
      } else {
        var keyName = arguments[0];
        var valueName = arguments[1];
      }
      for(;lc < arguments.length; ++lc) {
        var list = arguments[lc];
        if (!list) continue;

        for(var i=0; i < list.length; ++i) {
          if (keyName) {
            result[list[i][keyName]] = ( valueName ?
                                         ( valueName === true ? true : list[i][valueName] ) :
                                         list[i] );
          } else {
            result[list[i]] = true;
          }
        }
      }
      return result;
    },

    mapField: function (list, fieldName) {
      fieldName = fieldName || '_id';
      return list && list.map(function (doc) {
        return doc[fieldName];
      });
    },

    /**
     * Do a shallow copy of a type
     */
    shallowCopy: function (orig) {
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
        return orig.slice();
      }

      var result = {};
      for(var key in orig) {
        Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(orig, key));
      }

      return result;
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

    isArray: isArray,

    diff: function (a, b) {
      var result = [];
      for(var i = 0; i < a.length; ++i) {
        var val = a[i];
        b.indexOf(val) === -1 && result.push(val);
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

    parseEmailAddresses: function (input) {
      input = input || "";
      var addresses = [];

      var remainder = input.replace(
          /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}|(\w *)+<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}>)[,\s]*/ig,
        function (_, m1) {
          addresses.push(m1);
          return "";
        }
      );

      return addresses.length > 0 ? {addresses: addresses, remainder: remainder} : null;
    },

  });

  if (isClient) {
    util.thread = {};
    util.Fiber = function(func) {return {run: func}};
  } else {
    util.Fiber = requirejs.nodeRequire('fibers');
    Object.defineProperty(util, 'thread', {get: function () {
      return util.Fiber.current ? (util.Fiber.current.appThread || (util.Fiber.current.appThread = {})) : {};
    }});
  }

  function egal(x, y) {
    if (x === y) {
      // 0 === -0, but they are not identical
      return x !== 0 || 1 / x === 1 / y;
    }

    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
  }

  function isArray(arr) {
    return Object.prototype.toString.call(arr) == "[object Array]";
  }

  function deepEqual(expected, actual) {
    if (egal(expected, actual)) {
      return true;
    }

    if (typeof expected !== 'object' || typeof actual !== 'object') return false;

    if (expected.getTime && actual.getTime) return expected.getTime() === actual.getTime();

    if (isArray(expected)) {
      if (! isArray(actual)) return false;
      var len = expected.length;
      if (actual.length !== len) return false;
      for(var i = 0; i < len; ++i) {
        if (! deepEqual(expected[i], actual[i])) return false;
      }
      return true;
    }

    var ekeys = Object.keys(expected);

    if (Object.keys(actual).length !== ekeys.length) return false;
    return ekeys.every(function (key) {
      return deepEqual(expected[key], actual[key]);
    });
  }

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

  return util;

});
