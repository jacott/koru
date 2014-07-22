define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');

  var valueUndefined = {value: undefined};

  var TYPEORDER = {
    undefined: 0,
    string: 1,
    boolean: 2,
    number: 3,
    symbol: 4,
    object: 5,
    function: 6,
  };

  function typeorder(obj) {
    return obj === null ? -1 : TYPEORDER[typeof obj];
  }

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

    invert: function (map) {
      var result = {};
      for(var prop in map) {
        result[map[prop]] = prop;
      }
      return result;
    },

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
        if (isArray(curr)) {
          part = +parts[i];
          if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
          if (nv.value === undefined)
            curr.splice(part, 1);
          else
            curr[part] = nv.value;
        } else if (nv.value === undefined)
          delete curr[parts[i]];
        else {
          Object.defineProperty(curr, parts[i], nv);
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

    addItem: function (list, value) {
      var pos = list.indexOf(value);
      if (pos !== -1) return pos;
      list.push(value);
    },

    removeItem: function (list, item) {
      if (item != null && typeof item === 'object') {
        for(var index = 0; index < list.length; ++index) {
          var row = list[index];
          var found = true;
          for(var key in item) {
            if (item[key] !== row[key]) {
              found = false;
              break;
            }
          }
          if (found) {
            list.splice(index, 1);
            return row;
          }
        }
        return;
      }

      var index = list.indexOf(item);
      if (index === -1) return;
      list.splice(index, 1);
      return item;
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

    pick: function (map/*, fields */) {
      var result = {};
      for(var i = 1; i < arguments.length; ++i) {
        var field = arguments[i];
        result[field] = map[field];
      }
      return result;
    },

    toMap: function (keyName, valueName /*, lists */) {
      var result = {};
      if (arguments.length === 1) {
        keyName && keyName.forEach(function (item) {
          result[item] = true;
        });
        return result;
      }
      var lc = 2;
      for(var lc = 2;lc < arguments.length; ++lc) {
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

    findBy: function (list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(var i=0; i < list.length; ++i) {
        var row = list[i];
        if (row[fieldName] === value)
          return row;
      }
    },

    indexOf: function (list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(var i=0; i < list.length; ++i) {
        var row = list[i];
        if (row[fieldName] === value)
          return i;
      }
      return -1;
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
      case "[object Uint8Array]":
        var dst = new Uint8Array(new ArrayBuffer(orig.byteLength));
        dst.set(orig);
        return dst;
      }

      var result = {};
      for(var key in orig) {
        result[key] = util.deepCopy(orig[key]);
      }

      return result;
    },

    isArray: isArray,

    intersectp: function (list1, list2) {
      var set = {};
      list1.forEach(function (item) {
        set[item]=true;
      });

      return list2.some(function (item) {
        return item in set;
      });
    },

    diff: function (a, b) {
      var result = [];
      for(var i = 0; i < a.length; ++i) {
        var val = a[i];
        b.indexOf(val) === -1 && result.push(val);
      }
      return result;
    },

    union: function (args) {
      var set = {};
      for(var i = 0; i < arguments.length; ++i) {
        arguments[i].forEach(function (elm) {
          set[elm] = true;
        });
      }
      return Object.keys(set);
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

    hashToCss: function (hash) {
      return Object.keys(hash).map(function (key) {
        return key+":"+hash[key];
      }).join(";");
    },

    px: function (value) {
      return Math.round(value)+'px';
    },

    pc: function (value) {
      return Math.round(value*1000000)/10000+'%';
    },

    sansPx: function (value) {
      return value ? typeof value === 'string' ? +value.substring(0, value.length -2) : +value : 0;
    },

    compareByName: function (a, b) {
      var aname = (a && a.name) || '';
      var bname = (b && b.name) || '';
      return aname === bname ? 0 : aname < bname ? -1 : 1;
    },

    compareByField: function (field) {
      return function (a, b) {
        var afield = a && a[field], bfield = b && b[field];
        var atype = typeorder(afield), btype = typeorder(bfield);
        if (atype !== btype)
          return atype < btype ? -1 : 1;
        return afield === bfield ? 0 : afield < bfield ? -1 : 1;
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

    emailAddress: function (email, name) {
      return name.replace(/[<>]/g, '') + " <" + email + ">";
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

    if (expected == null || actual == null) return false;

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
