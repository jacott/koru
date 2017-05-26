define(function(require, exports, module) {
  const match       = require('./match');
  const stacktrace  = require('./stacktrace');
  const util        = require('./util-base');

  const TYPEORDER = {
    undefined: 0,
    string: 1,
    boolean: 2,
    number: 3,
    symbol: 4,
    object: 5,
    function: 6,
  };

  const PRIMITIVE  = {string: 1, number: 1, boolean: 1, undefined: 1, function: 2};

  const typeorder = obj => obj === null ? -1 : TYPEORDER[typeof obj];

  const slice = Array.prototype.slice;

  const egal = Object.is === undefined ? (x, y) => {
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
  } : Object.is;

  function sansSuffix(value) {
      return value ? typeof value === 'string' ?
      +value.substring(0, value.length - this) : +value : 0;
  }

  const colorToArray = (color) => {
    if (! color) return color;
    if (typeof color !== 'string') return color;
    const result = [];
    const m = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?\s*$/.exec(color);
    if (m) {
      let i;
      for(i = 1; i < 4; ++i) {
        result.push(parseInt(m[i], 16));
      }
      result.push(m[4] ? Math.round(parseInt(m[i], 16)*100/256)/100 : 1);
      return result;
    } else {
      const m = /^\s*rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\s*\)\s*$/.exec(color);
      if (m) {
        let i;
        for(i = 1; i < 4; ++i) {
          result.push(parseInt(m[i]));
        }
        result.push(m[4] ? parseFloat(m[i]) : 1);
        return result;
      } else {
        const m = /^\s*#([\da-f])([\da-f])([\da-f])\s*$/.exec(color);
        if (m) {
          for(let i = 1; i < 4; ++i) {
            result.push(parseInt(m[i]+m[i], 16));
          }
          result.push(1);
          return result;
        }
      }
    }
  };


  const deepEqual = (actual, expected, maxLevel=util.MAXLEVEL) => {
    if (egal(actual, expected)) {
      return true;
    }

    if (match.match.$test(expected) && expected.$test(actual))
      return true;

    if (typeof actual !== 'object' || typeof expected !== 'object')
      return actual === undefined || expected === undefined ? actual == expected : false;

    if (actual == null || expected == null) return false;

    if (actual.getTime && expected.getTime) return actual.getTime() === expected.getTime();

    if (maxLevel == 0)
      throw new Error('deepEqual maxLevel exceeded');

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected)) return false;
      const len = actual.length;
      if (expected.length !== len) return false;
      for(let i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i], maxLevel-1)) return false;
      }
      return true;
    }

    if (Object.getPrototypeOf(actual) !== Object.getPrototypeOf(expected))
      return false;

    const akeys = Object.keys(actual);

    for (const key in expected) {
      const vale = expected[key];
      const vala = actual[key];
      if (egal(vala, vale)) continue;
      if (vala === undefined || vale === undefined) return false;
      if (! deepEqual(vala, vale, maxLevel-1))
        return false;
    }
    for (const key in actual) {
      if (expected[key] === undefined && actual[key] !== undefined)
        return false;
    }
    return true;
  };

  const twoDigits = num => {
    const str = ''+num;
    return str.length === 1 ? `0${str}` : str;
  };

  const identity = value => value;

  util.merge(util, {
    DAY: 1000*60*60*24,
    MAXLEVEL: 50,
    EMAIL_RE: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i,

    mergeExclude(obj, properties, exclude) {
      for(const prop in properties) {
        if (exclude[prop]) continue;
        Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
      }
      return obj;
    },

    mergeInclude(obj, properties, include) {
      if (Array.isArray(include)) {
        for(let i = 0; i < include.length; ++i) {
          const prop = include[i];
          const desc = Object.getOwnPropertyDescriptor(properties,prop);
          desc && Object.defineProperty(obj, prop, desc);
        }
      } else for(const prop in include) {
        const desc = Object.getOwnPropertyDescriptor(properties,prop);
        desc && Object.defineProperty(obj, prop, desc);
      }
      return obj;
    },

    reverseMerge(obj, properties, exclude) {
      if (properties == null) return obj;
      for(const prop in properties) {
        if (exclude && exclude[prop]) continue;
        if (! (prop in obj)) {
          const desc = Object.getOwnPropertyDescriptor(properties, prop);
          desc && Object.defineProperty(obj, prop, desc);
        }
      }
      return obj;
    },

    mergeOwnDescriptors(dest, src) {
      const names = Object.getOwnPropertyNames(src);
      for(let i = names.length - 1; i >= 0 ; --i) {
        const name = names[i];
        Object.defineProperty(dest, name, Object.getOwnPropertyDescriptor(src, name));
      }
      return dest;
    },

    forEach(list, func) {
      if (! list) return;
      const len = list.length;
      for(let i = 0; i < len; ++i) {
        func(list[i], i);
      }
    },

    reverseForEach(list, visitor) {
      if (! list) return;
      const len = list.length;
      for(let i = len-1; i >= 0 ; --i) {
        visitor(list[i], i);
      }
    },

    map(list, func) {
      const len = list.length;
      const result = new Array(len);
      for(let i = 0; i < len; ++i) {
        result[i] = func(list[i], i);
      }
      return result;
    },

    mapLinkedList(ll, f) {
      const ans = [];
      for(let i = ll; i != null; i = i.next) {
        ans.push(f(i));
      }
      return ans;
    },

    append(list, append) {
      const len = append.length;
      const dl = list.length;
      list.length = dl + len;
      for(let i = 0; i < len; ++i) {
        list[dl+i] = append[i];
      }
      return list;
    },

    /**
     * Fixes NaN === NaN (should be true) and
     * -0 === +0 (should be false)
     *  http://wiki.ecmascript.org/doku.php?id=harmony:egal
     */
    egal,
    is: egal,

    /**
     * Only for undefined, null, number, string, boolean, date, array
     * and object. All the immutable types are compared with
     * egal. Dates are compared via getTime. Array and Object
     * enumerables with deepEqual.
     *
     * Any other types will always return false.
     */
    deepEqual,

    shallowEqual(array1, array2) {
      if (! Array.isArray(array1) || ! Array.isArray(array2) || array1.length !== array2.length)
        return false;
      for(let i = 0; i < array1.length; ++i) {
        if (array1[i] !== array2[i])
          return false;
      }
      return true;
    },

    compareVersion(a, b) {
      if (a === b) return 0;

      const re = /^v([\d.]+)(?:-(\d+))?(.*)$/;
      const ma = re.exec(a);
      const mb = re.exec(b);

      if (ma && mb) {
        const pa = ma[1].split('.');
        const pb = mb[1].split('.');
        const len = Math.max(pa.length, pb.length);
        for(let i = 0; i < len; ++i) {
          if (pa[i] !== pb[i]) {
            const an = +pa[i] || 0, bn = +pb[i] || 0;
            if (an !== bn)
              return an > bn ? 1 : -1;
          }
        }

        const an = +ma[2] || 0, bn = +mb[2] || 0;
        if (an !== bn)
          return an > bn ? 1 : -1;

        return ma[3] === mb[3] ? 0 : ma[3] > mb[3] ? 1 : 1;
      }
      return a > b ? 1 : -1;
    },

    invert(map, func) {
      const result = {};
      for(const prop in map) {
        result[map[prop]] = func ? func(prop) : prop;
      }
      return result;
    },

    lookupDottedValue(key, attributes) {
      const parts = key.split('.');
      let val = attributes[parts[0]];
      for(let i=1; val && i < parts.length;++i) {
        val = val[parts[i]];
      }
      return val;
    },

    /**
     * includesAttributes will check each key in attrs against the
     * list of docs. The first docs to have the key will be used in
     * the equality check. In this changes can be tested by passing
     * the arguments: includesAttributes(attrs, changes, doc)
     */
    includesAttributes(attrs, ...docs) {
      for(const key in attrs) {
        let match = false;
        for(let i = 0; i < docs.length; ++i) {
          const doc = docs[i];
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

    extractError(ex) {
      const st = stacktrace(ex);
      return ex.toString() + "\n" + (st ? st.join("\n") : util.inspect(ex));
    },
    stacktrace,

    slice(list, from, to) {
      return slice.call(list, from, to);
    },

    isObjEmpty(obj) {
      if (obj) for(const noop in obj) {return false;}
      return true;
    },

    firstParam(obj) {
      if (obj) for(const key in obj) {return obj[key];}
    },

    keyMatches(obj, regex) {
      let m;
      if (obj != null) for (const key in obj) {
        if (m = regex.exec(key))
          return m;
      }
      return false;
    },

    addItem(list, item) {
      const pos = util.itemIndex(list, item);
      if (pos !== -1) return pos;
      list.push(item);
    },

    itemIndex(list, item) {
      if (item != null && typeof item === 'object') {
        for(let index = 0; index < list.length; ++index) {
          const row = list[index];
          let found = true;
          for(const key in item) {
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

    removeItem(list, item) {
      const index = util.itemIndex(list, item);
      if (index === -1) return;
      item = list[index];
      list.splice(index, 1);
      return item;
    },

    values(map) {
      const result = [];
      for(const key in map) result.push(map[key]);
      return result;
    },

    indexOfRegex(list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(let i=0; i < list.length; ++i) {
        const row = list[i];
        if (value.test(row[fieldName]))
          return i;
      }
      return -1;
    },

    pick(map, ...fields) {
      const result = {};
      for(let i = 0; i < fields.length; ++i) {
        const field = fields[i];
        result[field] = map[field];
      }
      return result;
    },

    mapToSearchStr(map) {
      return util.map(
        Object.keys(map),
        key => `${util.encodeURIComponent(key)}=${util.encodeURIComponent(map[key])}`
      ).join('&');
    },

    searchStrToMap(query) {
      const result = {};
      if (! query) return result;
      util.forEach(query.split('&'), item => {
        const parts = item.split('=', 2);
        result[util.decodeURIComponent(parts[0])] = util.decodeURIComponent(parts[1]);
      });
      return result;
    },

    encodeURIComponent(value) {
      if (value == null || value === '') return '';

      const result = encodeURIComponent(value);
      // Fix the mismatch between OAuth's  RFC3986's and Javascript
      return result.replace(/\!/g, "%21")
        .replace(/\'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29")
        .replace(/\*/g, "%2A");
    },

    decodeURIComponent(value) {
      if (! value) return null;
      return decodeURIComponent(value.replace(/\+/g, " "));
    },

    toMap (keyName, valueName/*, lists */) {
      const result = {};
      if (arguments.length === 1) {
        keyName && util.forEach(keyName, item => {result[item] = true});
        return result;
      }
      let func;
      if (valueName == null)
        func = identity;
      else switch(typeof(valueName)) {
      case 'string':
      case 'number':
        func = curr => curr[valueName];
        break;
      case 'function':
        func = valueName;
        break;
      }
      for(let lc = 2;lc < arguments.length; ++lc) {
        const list = arguments[lc];
        if (!list) continue;

        for(let i=0; i < list.length; ++i) {
          if (keyName != null) {
            result[list[i][keyName]] = func ? func(list[i], i) : valueName;
          } else {
            result[list[i]] = true;
          }
        }
      }
      return result;
    },

    mapField(list, fieldName) {
      fieldName = fieldName || '_id';
      return list && util.map(list, doc => doc[fieldName]);
    },

    idNameListToMap(list) {
      const result = {};
      util.forEach(list, item => {
        result[item[0]] = item[1];
      });
      return result;
    },

    find(list, func) {
      const len = list.length;
      for(let i = 0; i < len; ++i) {
        const result = list[i];
        if (func(result, i)) return result;
      }
    },

    flatten(ary, level) {
      const result = [];

      const internal = (a, l) => {
        util.forEach(a, value => {
          if (l && Array.isArray(value))
            internal(value, l - 1);
          else
            result.push(value);
        });
      };

      internal(ary, level === true ? 1 : level || -1);
      return result;
    },

    findBy(list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(let i=0; i < list.length; ++i) {
        const row = list[i];
        if (row[fieldName] === value)
          return row;
      }
    },

    indexOf(list, value, fieldName) {
      if (!list) return;
      fieldName = fieldName || '_id';
      for(let i=0; i < list.length; ++i) {
        const row = list[i];
        if (row[fieldName] === value)
          return i;
      }
      return -1;
    },

    protoCopy(source, attributes) {
      return util.merge(Object.create(source), attributes);
    },

    /**
     * Do a shallow copy of a type
     */
    shallowCopy(orig) {
      if (PRIMITIVE[typeof orig] !== undefined || orig === null) return orig;

      const {constructor} = orig;
      if (constructor === Array)
        return orig.slice();

      if (constructor === Date || constructor === Uint8Array)
        return new constructor(orig);

      const copy = Object.create(Object.getPrototypeOf(orig));
      for(const key in orig) copy[key] = orig[key];
      return copy;
    },

    /** Does not deep copy functions */
    deepCopy(orig, maxLevel=util.MAXLEVEL) {
      if (PRIMITIVE[typeof orig] !== undefined || orig === null) return orig;

      if (maxLevel == 0)
        throw new Error('deepCopy maxLevel exceeded');

      const {constructor} = orig;

      if (constructor === Array) {
        --maxLevel;
        return orig.map(v => util.deepCopy(v, maxLevel));
      }

      if (constructor === Date || constructor === Uint8Array)
        return new constructor(orig);

      const copy = Object.create(Object.getPrototypeOf(orig));
      for(const key in orig) copy[key] = util.deepCopy(orig[key], maxLevel-1);
      return copy;
    },

    intersectp (list1, list2) {
      const set = new Set(list1);

      return list2.some(item => set.has(item));
    },

    diff(a, b) {
      if (! b) return a ? a.slice() : [];
      const result = [];
      if (! a) return result;
      const bMap = new Set(b);
      for (let i = 0; i < a.length; ++i) {
        const val = a[i];
        bMap.has(val) || result.push(val);
      }
      return result;
    },

    symDiff(a, b) {
      const ans = [];
      const bMap = new Set(b);

      if (a) for(let i = 0; i < a.length; ++i) {
        const val = a[i];
        if (bMap.has(val))
          bMap.delete(val);
        else
          ans.push(val);
      }

      for (const val of bMap.values()) {
        ans.push(val);
      }
      return ans;
    },

    union(first, ...rest) {
      const ans = first ? first.slice() : [];
      const objSet = new Set(first);

      for (let i = 0; i < rest.length; ++i) {
        const list = rest[i];
        if (list) for (let j = 0; j < list.length; ++j) {
          const val = list[j];
          if (! objSet.has(val)) {
            objSet.add(val);
            ans.push(val);
          }
        }
      }
      return ans;
    },

    pluralize(name, value) {
      if (value === 1) return name;
      return name+'s';
    },

    humanize(name) {
      name = this.uncapitalize(name);
      return name.replace(/_id$/,'').replace(/[_-]/g,' ').replace(
          /([A-Z])/g, (_, m1) => ' '+m1.toLowerCase());
    },

    initials(name, count, abvr) {
      count = count || 3;

      name = (name || '').split(' ');
      let result = '';
      for(let i=0;count > 1 && i < name.length -1;++i, --count) {
        result += name[i].slice(0,1);
      }
      if (count > 0 && name.length > 0)
        result += name[name.length-1].slice(0,1);

      if (result.length < 2 && abvr)
        result += name[0].slice(1).replace(/[aeiou]*/ig, '').slice(0, count - 1);

      return result.toUpperCase();
    },

    dasherize(name) {
      return this.humanize(name).replace(/[\s_]+/g,'-');
    },

    labelize(name) {
      return this.capitalize(this.humanize(name));
    },

    sansId(name) {
      return name.replace(/_ids?$/,'');
    },

    capitalize(value) {
      if(value == null || value === '')
        return '';

      return value.charAt(0).toUpperCase() + value.substring(1);
    },

    uncapitalize(value) {
      if(value == null || value === '')
        return '';

      return value.charAt(0).toLowerCase() + value.substring(1);
    },

    titleize(value) {
      return this.capitalize(value.replace(
          /[-._%+A-Z]\w/g, w => ' ' + util.capitalize(w.replace(/^[-._%+]/,''))).trim());
    },

    camelize(value) {
      return value.replace(/[-._%+A-Z]\w/g, w => util.capitalize(w.replace(/^[-._%+]/,'')));
    },

    niceFilename(name) {
      return name && name.toLowerCase().replace(/[^a-zA-Z0-9-]+/g,'-');
    },

    hashToCss(hash) {
      return util.map(Object.keys(hash), key => `${key}:${hash[key]}`).join(";");
    },

    px(value) {
      return Math.round(value)+'px';
    },

    pc(fraction) {
      return fraction*100 + '%';
    },

    toDp(number, dp, zeroFill) {
      const scalar = Math.pow(10, dp);
      let decs = ''+(Math.round(number * scalar) % scalar);

      if (! zeroFill && ! decs)
        return ''+number;

      while (decs.length < dp)
        decs = '00000'.slice(decs.length - dp) + decs;
      if (!zeroFill) {
        decs = decs.replace(/0+$/, '');
        if (! decs)
          return ''+Math.round(number);
      }
      return Math.floor(number) + "." + decs;
    },

    sansPx: sansSuffix.bind(2),
    sansPc: sansSuffix.bind(1),

    compareByName(a, b) {
      const aname = (a && a.name) || '';
      const bname = (b && b.name) || '';
      return aname === bname ? 0 : aname < bname ? -1 : 1;
    },

    compareByOrder(a, b) {
      a = (a && a.order) || 0;
      b = (b && b.order) || 0;
      return a === b ? 0 : a < b ? -1 : 1;
    },

    compareByField(field, direction) {
      direction = direction === -1 ? -1 : 1;
      return (a, b) => {
        const afield = a && a[field], bfield = b && b[field];
        const atype = typeorder(afield), btype = typeorder(bfield);
        if (atype !== btype)
          return atype < btype ? -direction : direction;
        return afield === bfield ? 0 : afield < bfield ? -direction : direction;
      };
    },

    compareByFields(...fields) {
      return (a, b) => {
        let direction = 1;
        for (let i = 0; i < fields.length; ++i) {
          const field = fields[i];
          if (typeof field === 'number') {
            direction = field;
            continue;
          }
          const afield = a && a[field], bfield = b && b[field];
          const atype = typeorder(afield), btype = typeorder(bfield);
          if (atype !== btype)
            return atype < btype ? -direction : direction;
          if (afield !== bfield)
            return afield < bfield ? -direction : direction;
        }
        return 0;
      };
    },

    compareBy(list) {
      const len = list.length;
      return (a, b) => {
        for(let i = 0; i < len; ++i) {
          const field = list[i];
          let dir = list[i+1];
          if (typeof dir === 'number')
            ++i;
          else
            dir = 1;
          const af = a[field];
          const bf = b[field];
          if (af !== bf) {
            const atype = typeorder(af), btype = typeorder(bf);
            if (atype !== btype)
              return atype < btype ? -dir : dir;

            return af < bf ? -dir : dir;
          }
        }
        return 0;
      };
    },

    colorToArray,

    setNestedHash(value, hash, ...keys) {
      const last = keys.length-1;
      for(let i = 0; i < last; ++i) {
        const key = keys[i];
        hash = hash[key] || (hash[key] = {});
      }

      return hash[keys[last]] = value;
    },

    getNestedHash(hash, ...keys) {
      const last = keys.length-1;
      for(let i = 0; i < last; ++i) {
        const key = keys[i];
        hash = hash[key];
        if (! hash) return undefined;
      }

      return hash[keys[last]];
    },

    deleteNestedHash(hash, ...keys) {
      let last = keys.length-1;
      const prevs = [];
      for(let i = 0; i < last; ++i) {
        const key = keys[i];
        prevs.push(hash);
        hash = hash[key];
        if (! hash) return undefined;
      }
      prevs.push(hash);

      const value = hash[keys[last]];
      delete hash[keys[last]];

      for(let i = prevs.length - 1; i >0; --i) {
        for (const noop in prevs[i]) return value;
        delete prevs[i-1][keys[--last]];
      }
      return value;
    },

    withDateNow(date, func) {
      date = +date;
      const thread = util.thread;
      const dates = thread.dates || (thread.dates = []);
      dates.push(thread.date);
      thread.date = date;
      try {
        return func();
      } finally {
        thread.date = dates.pop();
      }
    },

    dateNow() {
      return util.thread.date || Date.now();
    },

    newDate() {
      return new Date(util.dateNow());
    },

    dateInputFormat(date) {
      if (date && date.constructor === Date)
        return date.getFullYear() + '-' + twoDigits(date.getMonth()+1) +
        '-' + twoDigits(date.getDate());
      return '';
    },

    yyyymmddToDate(value) {
      const m = /^\s*(\d\d\d\d)([\s-/])(\d\d?)\2(\d\d?)\s*$/.exec(value);
      if (! m) return;
      const year = +m[1];
      const month = +m[3] - 1;
      const date = +m[4];
      const res = new Date(year, month, date);

      if (res.getFullYear() === year &&
          res.getMonth() === month &&
          res.getDate() === date)
        return res;
    },

    twoDigits,

    emailAddress(email, name) {
      return name.replace(/[<>]/g, '') + " <" + email + ">";
    },

    extractFromEmail(email) {
      const ans = {};
      const match = /^(.*)<(.*)>$/.exec(email);
      if (match) {
        ans.name = match[1].trim();
        email = match[2];
      } else {
        ans.name = util.titleize(email.trim().split('@')[0]);
      }
      ans.email = email.trim().toLowerCase();
      return ans;
    },

    parseEmailAddresses(input) {
      input = input || "";
      const addresses = [];

      const remainder = input.replace(
          /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}|(\w *)+<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}>)[,\s]*/ig,
        (_, m1) => (addresses.push(m1), "")
      );

      return addresses.length > 0 ? {addresses: addresses, remainder: remainder} : null;
    },

    asyncToGenerator(fn) {
      return function () {
        const gen = fn.apply(this, arguments);
        return new Promise((resolve, reject) => {
          const step = (key, arg) => {
            try {
              var info = gen[key](arg);
              var value = info.value;
            } catch (error) {
              reject(error); return;
            }
            if (info.done) {
              resolve(value);
            } else {
              return Promise.resolve(value).then(
                value => {step("next", value)},
                err => {step("throw", err)}
              );
            }
          };
          return step("next");
        });
      };
    },
  });

  /**
   * @deprecated reverseExtend
   */
  util.reverseExtend = util.reverseMerge;

  return util;
});
