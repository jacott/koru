define(function(require, exports, module) {
  var util = require('./util-base');
  var stacktrace = require('./stacktrace');
  var match = require('./match');

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

  var slice = Array.prototype.slice;

  util.extend(util, {
    EMAIL_RE: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,

    reverseExtend: function (obj, properties, exclude) {
      if (properties == null) return obj;
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

    forEach: function forEach(list, func) {
      if (! list) return;
      var len = list.length;
      for(var i = 0; i < len; ++i) {
        func(list[i], i);
      }
    },

    reverseForEach: function reverseForEach(list, func) {
      if (! list) return;
      var len = list.length;
      for(var i = len-1; i >= 0 ; --i) {
        func(list[i], i);
      }
    },

    map: function mymap(list, func) {
      var len = list.length;
      var result = new Array(len);
      for(var i = 0; i < len; ++i) {
        result[i] = func(list[i], i);
      }
      return result;
    },

    append: function (list, append) {
      var len = append.length;
      var dl = list.length;
      list.length = dl + len;
      for(var i = 0; i < len; ++i) {
        list[dl+i] = append[i];
      }
      return list;
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

    shallowEqual: function (array1, array2) {
      if (! Array.isArray(array1) || ! Array.isArray(array2) || array1.length !== array2.length)
        return false;
      for(var i = 0; i < array1.length; ++i) {
        if (array1[i] !== array2[i])
          return false;
      }
      return true;
    },

    invert: function (map, func) {
      var result = {};
      for(var prop in map) {
        result[map[prop]] = func ? func(prop) : prop;
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
        util.applyChange(attrs, key, changes);
      }

      return attrs;
    },

    applyChange: function (attrs, key, changes) {
      var index = key.indexOf(".");

      var nv = Object.getOwnPropertyDescriptor(changes, key);
      if (index === -1) {
        var ov = Object.getOwnPropertyDescriptor(attrs, key);

        if (ov && deepEqual(nv.value, ov.value))
          delete changes[key];
        else
          Object.defineProperty(changes, key, ov || valueUndefined);

        if (nv.value === undefined)
          delete attrs[key];
        else
          Object.defineProperty(attrs, key, nv);

      } else { // update part of attribute
        var parts = key.split(".");
        var curr = attrs;
        for(var i = 0; i < parts.length - 1; ++i) {
          var part = parts[i];
          if (Array.isArray(curr)) {
            part = +parts[i];
            if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
          }
          curr = curr[part] ||
            (curr[part] = parts[i+1].match(/^\$[+\-]\d+/) ? [] : {});
        }
        part = parts[i];
        var m = part.match(/^\$([+\-])(\d+)/);
        if (m) {
          if (m[1] === '-')
            util.removeItem(curr, nv.value);
          else
            util.addItem(curr, nv.value);

          delete changes[key];
          Object.defineProperty(changes, key.replace(/\.\$([+\-])(\d+)/, function (m, sign, idx) {
            return ".$" + (sign === '-' ? '+' : '-') + idx;
          }), nv);
        } else {
          var ov = Object.getOwnPropertyDescriptor(curr, part);
          if (ov && deepEqual(nv.value, ov.value))
            delete changes[key];
          else
            Object.defineProperty(changes, key, ov || valueUndefined);
          if (Array.isArray(curr)) {
            part = +part;
            if (part !== part) throw new Error("Non numeric index for array: '" + parts[i] + "'");
            if (nv.value === undefined)
              curr.splice(part, 1);
            else
              curr[part] = nv.value;
          } else {
            if (nv.value === undefined)
              delete curr[parts[i]];
            else {
              Object.defineProperty(curr, parts[i], nv);
            }
          }
        }
      }
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
      return slice.call(list, from, to);
    },

    isObjEmpty: function (obj) {
      if (obj) for(var noop in obj) {return false;}
      return true;
    },

    keyMatches: function (obj, regex) {
      if (obj) for(var key in obj) {
        if (regex.test(key))
          return true;
      }
      return false;
    },

    addItem: function (list, item) {
      var pos = util.itemIndex(list, item);
      if (pos !== -1) return pos;
      list.push(item);
    },

    itemIndex: function (list, item) {
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
            return index;
          }
        }
        return -1;
      }

      return list.indexOf(item);
    },

    removeItem: function (list, item) {
      var index = util.itemIndex(list, item);
      if (index === -1) return;
      item = list[index];
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

    mapToSearchStr: function (map) {
      return util.map(Object.keys(map), function (key) {
        return util.encodeURIComponent(key) + '=' + util.encodeURIComponent(map[key]);
      }).join('&');
    },

    searchStrToMap: function (query) {
      var result = {};
      if (! query) return result;
      util.forEach(query.split('&'), function (item) {
        var parts = item.split('=', 2);
        result[util.decodeURIComponent(parts[0])] = util.decodeURIComponent(parts[1]);
      });
      return result;
    },

    encodeURIComponent: function (value) {
      if (value == null || value === '') return '';

      var result = encodeURIComponent(value);
      // Fix the mismatch between OAuth's  RFC3986's and Javascript
      return result.replace(/\!/g, "%21")
        .replace(/\'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\*/g, "%2A");
    },

    decodeURIComponent: function (value) {
      if (! value) return null;
      return decodeURIComponent(value.replace(/\+/g, " "));
    },

    toMap: function (keyName, valueName /*, lists */) {
      var result = {};
      if (arguments.length === 1) {
        keyName && util.forEach(keyName, function (item) {
          result[item] = true;
        });
        return result;
      }
      var lc = 2;
      if (valueName == null)
        var func = function (curr) {return curr};
      else switch(typeof(valueName)) {
      case 'string':
      case 'number':
        var func = function (curr) {return curr[valueName]};
        break;
      case 'function':
        var func = valueName;
        break;
      }
      for(var lc = 2;lc < arguments.length; ++lc) {
        var list = arguments[lc];
        if (!list) continue;

        for(var i=0; i < list.length; ++i) {
          if (keyName != null) {
            result[list[i][keyName]] = func ? func(list[i], i) : valueName;
          } else {
            result[list[i]] = true;
          }
        }
      }
      return result;
    },

    mapField: function (list, fieldName) {
      fieldName = fieldName || '_id';
      return list && util.map(list, function (doc) {
        return doc[fieldName];
      });
    },

    idNameListToMap: function (list) {
      var result = {};
      util.forEach(list, function (item) {
        result[item[0]] = item[1];
      });
      return result;
    },

    find: function (list, func) {
      var len = list.length;
      var result;
      for(var i = 0; i < len; ++i) {
        result = list[i];
        if (func(result, i)) return result;
      }
    },

    flatten: function (ary, level) {
      var result = [];

      function internal(a, l) {
        util.forEach(a, function (value) {
          if (l && Array.isArray(value))
            internal(value, l - 1);
          else
            result.push(value);
        });
      }

      internal(ary, level === true ? 1 : level || -1);
      return result;
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
        return util.map(orig, function (item) {
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

    intersectp: function (list1, list2) {
      var set = {};
      util.forEach(list1, function (item) {
        set[item]=true;
      });

      return list2.some(function (item) {
        return item in set;
      });
    },

    diff: function (a, b) {
      var result = [];
      if (a) for(var i = 0; i < a.length; ++i) {
        var val = a[i];
        (! b || b.indexOf(val) === -1) && result.push(val);
      }
      return result;
    },

    union: function (args) {
      var set = {};
      for(var i = 0; i < arguments.length; ++i) {
        util.forEach(arguments[i], function (elm) {
          set[elm] = true;
        });
      }
      return Object.keys(set);
    },

    pluralize: function (name, value) {
      if (value === 1) return name;
      return name+'s';
    },

    humanize: function (name) {
      name = this.uncapitalize(name);
      return name.replace(/_id$/,'').replace(/[_-]/g,' ').replace(/([A-Z])/g, function (_, m1) {
        return ' '+m1.toLowerCase();
      });
    },

    initials: function (name, count, abvr) {
      count = count || 3;

      name = (name || '').split(' ');
      var result = '';
      for(var i=0;count > 1 && i < name.length -1;++i, --count) {
        result += name[i].slice(0,1);
      }
      if (count > 0 && name.length > 0)
        result += name[name.length-1].slice(0,1);

      if (result.length < 2 && abvr)
        result += name[0].slice(1).replace(/[aeiou]*/ig, '').slice(0, count - 1);

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

    niceFilename: function (name) {
      return name && name.toLowerCase().replace(/[^a-zA-Z0-9-]+/g,'-');
    },

    hashToCss: function (hash) {
      return util.map(Object.keys(hash), function (key) {
        return key+":"+hash[key];
      }).join(";");
    },

    px: function (value) {
      return Math.round(value)+'px';
    },

    pc: function (value) {
      return Math.round(value*1000000)/10000+'%';
    },

    sansPx: sansSuffix.bind(2),
    sansPc: sansSuffix.bind(1),

    compareByName: function (a, b) {
      var aname = (a && a.name) || '';
      var bname = (b && b.name) || '';
      return aname === bname ? 0 : aname < bname ? -1 : 1;
    },

    compareByOrder: function (a, b) {
      a = (a && a.order) || 0;
      b = (b && b.order) || 0;
      return a === b ? 0 : a < b ? -1 : 1;
    },

    compareByField: function (field, direction) {
      direction = direction === -1 ? -1 : 1;
      return function (a, b) {
        var afield = a && a[field], bfield = b && b[field];
        var atype = typeorder(afield), btype = typeorder(bfield);
        if (atype !== btype)
          return atype < btype ? -direction : direction;
        return afield === bfield ? 0 : afield < bfield ? -direction : direction;
      };
    },

    compareBy: function (list) {
      var len = list.length;
      return function (a, b) {
        for(var i = 0; i < len; ++i) {
          var field = list[i];
          var dir = list[i+1];
          if (typeof dir === 'number')
            ++i;
          else
            dir = 1;
          var af = a[field];
          var bf = b[field];
          if (af !== bf) {
            var atype = typeorder(af), btype = typeorder(bf);
            if (atype !== btype)
              return atype < btype ? -dir : dir;

            return af < bf ? -dir : dir;
          }
        }
        return 0;
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

    dateInputFormat: function (date) {
      if (date && date.constructor === Date)
        return date.getFullYear() + '-' + twoDigits(date.getMonth()+1) +
        '-' + twoDigits(date.getDate());
      return '';
    },

    yyyymmddToDate: function (value) {
      var m = /^\s*(\d\d\d\d)([\s-/])(\d\d?)\2(\d\d?)\s*$/.exec(value);
      if (! m) return;
      var year = +m[1];
      var month = +m[3] - 1;
      var date = +m[4];
      var res = new Date(year, month, date);

      if (res.getFullYear() === year &&
          res.getMonth() === month &&
          res.getDate() === date)
        return res;
    },

    twoDigits: twoDigits,

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

    TwoIndex: TwoIndex,
  });

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

  function deepEqual(actual, expected) {
    if (egal(actual, expected)) {
      return true;
    }

    if (match.match.$test(expected) && expected.$test(actual))
      return true;

    if (typeof actual !== 'object' || typeof expected !== 'object')
      return actual === undefined || expected === undefined ? actual == expected : false;

    if (actual == null || expected == null) return false;

    if (actual.getTime && expected.getTime) return actual.getTime() === expected.getTime();

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected)) return false;
      var len = actual.length;
      if (expected.length !== len) return false;
      for(var i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i])) return false;
      }
      return true;
    }

    var ekeys = Object.keys(actual);

    if (Object.keys(expected).length !== ekeys.length) return false;
    return ekeys.every(function (key) {
      return deepEqual(actual[key], expected[key]);
    });
  }

  function colorToArray(color) {
    if (typeof color !== 'string') return color;
    var result = [];
    var m = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?\s*$/.exec(color);
    if (m) {
      for(var i = 1; i < 4; ++i) {
        result.push(parseInt(m[i], 16));
      }
      result.push(m[4] ? Math.round(parseInt(m[i], 16)*100/256)/100 : 1);
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
        result.push(parseInt(m[i]+m[i], 16));
      }
      result.push(1);
      return result;
    }
  }

  function TwoIndex() {
    this.ids = Object.create(null);
  }

  TwoIndex.prototype = {
    constructor: TwoIndex,

    has: function (groupId, id) {
      if (id === undefined) return groupId in this.ids;
      var result = this.ids[groupId];
      return !! (result && id in result);
    },

    get: function (groupId, id) {
      var result = this.ids[groupId];
      if (id === undefined) return result;
      return result && result[id];
    },

    add: function (groupId, id, value) {
      var result = this.ids[groupId];
      if (! result) result = this.ids[groupId] = {};
      return result[id] = value;
    },

    remove: function (groupId, id) {
      if (id === undefined) delete this.ids[groupId];
      var result = this.ids[groupId];
      if (result) {
        delete result[id];
        for (var k in result) return;
        delete this.ids[groupId];
      }
    },
  };

  function sansSuffix (value) {
    return value ? typeof value === 'string' ? +value.substring(0, value.length - this) : +value : 0;
  }

  function twoDigits(num) {
    if (num < 10)
      return '0'+num;
    return ''+num;
  }

  return util;
});
