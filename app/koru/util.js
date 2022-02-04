/* global Intl */
define((require) => {
  'use strict';
  const match           = require('./match');
  const Stacktrace      = require('./stacktrace');
  const util            = require('./util-base');

  const {withId$} = require('koru/symbols');
  const {hasOwn} = util;

  const {is} = Object;

  const TYPEORDER = {
    undefined: 0,
    string: 1,
    boolean: 2,
    number: 3,
    symbol: 4,
    object: 5,
    function: 6,
  };

  const PRIMITIVE = {string: 1, number: 1, boolean: 1, undefined: 1, function: 2};

  const typeorder = (obj) => obj === null ? -1 : TYPEORDER[typeof obj];

  let timeAdjust = 0, timeUncertainty = 0;

  const slice = Array.prototype.slice;

  const enUsCollator = new Intl.Collator('en-US');
  const {compare} = enUsCollator;

  const compareByName = (a, b) => {
    const aname = (a && a.name) || '';
    const bname = (b && b.name) || '';
    const ans = compare(aname, bname);
    if (ans == 0) {
      if (a == null) return 0;
      const ai = a._id || '', bi = b._id || '';
      return ai === bi ? 0 : ai < bi ? -1 : 1;
    }
    return ans < 0 ? -1 : 1;
  }; compareByName.compareKeys = ['name', '_id'];

  const compareByOrder = (a, b) => {
    const ao = (a && a.order) || 0;
    const bo = (b && b.order) || 0;
    if (ao === bo) {
      if (a == null) return 0;
      const ai = a._id || '', bi = b._id || '';
      return ai === bi ? 0 : ai < bi ? -1 : 1;
    } else {
      return ao < bo ? -1 : 1;
    }
  }; compareByOrder.compareKeys = ['order', '_id'];

  const sansSuffix = (value, len) => value
        ? typeof value === 'string'
        ? +value.slice(0, -len)
        : +value
        : 0;

  const colorToArray = (color) => {
    if (! color) return color;
    if (typeof color !== 'string') return color;
    const result = [];
    const m = /^\s*#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?\s*$/.exec(color);
    if (m) {
      let i;
      for (i = 1; i < 4; ++i) {
        result.push(parseInt(m[i], 16));
      }
      result.push(m[4] ? Math.round(parseInt(m[i], 16) * 100 / 256) / 100 : 1);
      return result;
    } else {
      const m = /^\s*rgba?\s*\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\s*\)\s*$/.exec(color);
      if (m) {
        let i;
        for (i = 1; i < 4; ++i) {
          result.push(parseInt(m[i]));
        }
        result.push(m[4] ? parseFloat(m[i]) : 1);
        return result;
      } else {
        const m = /^\s*#([\da-f])([\da-f])([\da-f])\s*$/.exec(color);
        if (m) {
          for (let i = 1; i < 4; ++i) {
            result.push(parseInt(m[i] + m[i], 16));
          }
          result.push(1);
          return result;
        }
      }
    }
  };

  const deepEqual = (actual, expected, maxLevel=util.MAXLEVEL) => {
    if (is(actual, expected)) {
      return true;
    }

    if (match.isMatch(expected)) {
      return match.test(expected, actual);
    }

    if (typeof actual !== 'object' || typeof expected !== 'object') {
      return actual === undefined || expected === undefined ? actual == expected : false;
    }

    if (actual == null || expected == null) return false;

    if (maxLevel == 0) {
      throw new Error('deepEqual maxLevel exceeded');
    }

    if (Array.isArray(actual)) {
      if (! Array.isArray(expected)) return false;
      const len = actual.length;
      if (expected.length !== len) return false;
      for (let i = 0; i < len; ++i) {
        if (! deepEqual(actual[i], expected[i], maxLevel - 1)) return false;
      }
      return true;
    }

    const proto = Object.getPrototypeOf(actual);
    if (proto !== Object.getPrototypeOf(expected)) {
      return false;
    }

    if (proto === Date.prototype) return actual.getTime() === expected.getTime();

    if (proto === RegExp.prototype) {
      return actual.source === expected.source && actual.flags === expected.flags;
    }

    const akeys = Object.keys(actual);

    for (const key in expected) {
      const vale = expected[key];
      const vala = actual[key];
      if (is(vala, vale)) continue;
      if (vala === undefined || vale === undefined) return false;
      if (! deepEqual(vala, vale, maxLevel - 1)) {
        return false;
      }
    }
    for (const key in actual) {
      if (expected[key] === undefined && actual[key] !== undefined) {
        return false;
      }
    }
    return true;
  };

  const twoDigits = (num) => {
    const str = '' + num;
    return str.length === 1 ? `0${str}` : str;
  };

  const identity = (value) => value;

  const diffString = (oldstr, newstr) => {
    const lastold = oldstr.length - 1, lastnew = newstr.length - 1;
    const minLast = Math.min(lastold, lastnew);
    let s = 0, e = 0, oldchar = 0;
    // while the characters in oldstr and newstr are the same, increment s once for each character
    // designated by a single code point, twice for each character designated by a code point pair
    while (s <= minLast && (oldchar = oldstr.charCodeAt(s)) === newstr.charCodeAt(s)) {
      if (oldchar >= 0xd800 && oldchar <= 0xdbff && s < minLast) {
        if (oldstr.charCodeAt(s + 1) !== newstr.charCodeAt(s + 1)) break;
        ++s;
      }
      ++s;
    }
    // s is now the index of the first non-matching chararacter in oldstr and newstr

    // return undefined if oldstr and newstr are the same
    if (lastold == lastnew && s == minLast + 1) return;

    // starting at the end of oldstr and newstr, while the characters in oldstr
    // and newstr are the same, increment e
    while (s <= minLast - e && oldstr.charCodeAt(lastold - e) === newstr.charCodeAt(lastnew - e)) ++e;
    // e is now the number of matching characters at the end of oldstr and newstr

    return [s, oldstr.length - s - e, newstr.length - s - e];
  };

  const LOCAL_COMPARE_OPTS = {numeric: true};
  const localeCompare = (a, b) => {
    if (a === b) return 0;
    if (typeof a === 'string' && typeof b === 'string') {
      const ans = a.localeCompare(b, undefined, LOCAL_COMPARE_OPTS);
      if (ans != 0) return ans;
    }
    return a < b ? -1 : 1;
  };

  util.merge(util, {
    DAY: 1000*60*60*24,
    MAXLEVEL: 50,
    EMAIL_RE: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,

    diffString,
    diffStringLength: (oldstr, newstr) => {
      const ans = diffString(oldstr, newstr);
      return ans === undefined ? 0 : Math.max(ans[1], ans[2]);
    },

    localeCompare,

    defineAlias: (object, newAlias, existing) => {
      Object.defineProperty(object, newAlias, Object.getOwnPropertyDescriptor(object, existing));
    },

    setProperty: (object, name, descriptor) => {
      const oldDesc = Object.getOwnPropertyDescriptor(object, name);
      if (oldDesc === undefined) {
        if (descriptor.writable === undefined && hasOwn(descriptor, 'value')) {
          descriptor.writable = true;
        }
        if (descriptor.enumerable === undefined) descriptor.enumerable = true;
        if (descriptor.configurable === undefined) descriptor.configurable = true;
      }
      Object.defineProperty(object, name, descriptor);
      return oldDesc;
    },

    mergeExclude(obj, properties, exclude) {
      for (const prop in properties) {
        if (hasOwn(exclude, prop)) continue;
        Object.defineProperty(obj, prop, Object.getOwnPropertyDescriptor(properties, prop));
      }
      return obj;
    },

    mergeInclude(obj, properties, include) {
      if (Array.isArray(include)) {
        for (let i = 0; i < include.length; ++i) {
          const prop = include[i];
          const desc = Object.getOwnPropertyDescriptor(properties, prop);
          desc && Object.defineProperty(obj, prop, desc);
        }
      } else {
        for (const prop in include) {
          const desc = Object.getOwnPropertyDescriptor(properties, prop);
          desc && Object.defineProperty(obj, prop, desc);
        }
      }
      return obj;
    },

    reverseMerge(obj, properties, exclude) {
      if (properties == null) return obj;
      for (const prop in properties) {
        if (exclude && exclude[prop]) continue;
        if (! (prop in obj)) {
          const desc = Object.getOwnPropertyDescriptor(properties, prop);
          desc && Object.defineProperty(obj, prop, desc);
        }
      }
      return obj;
    },

    mergeOwnDescriptors(dest, source) {
      const decs = Object.getOwnPropertyDescriptors(source);
      for (const name in decs) {
        Object.defineProperty(dest, name, decs[name]);
      }
      return dest;
    },

    extractKeys(obj, keys) {
      const result = {};
      if (Array.isArray(keys)) {
        const len = keys.length;
        for (let i = 0; i < len; ++i) {
          const key = keys[i];
          if (key in obj) {
            result[key] = obj[key];
          }
        }
      } else {
        for (const key in keys) {
          if (key in obj) {
            result[key] = obj[key];
          }
        }
      }
      return result;
    },

    extractNotKeys(obj, keys) {
      const result = {};
      for (const key in obj) {
        if (! (key in keys)) {
          result[key] = obj[key];
        }
      }
      return result;
    },

    splitKeys(obj, includeKeys) {
      const include = {}, exclude = {};
      for (const key in obj) {
        if (key in includeKeys) {
          include[key] = obj[key];
        } else {
          exclude[key] = obj[key];
        }
      }
      return {include, exclude};
    },

    assignOption: (obj={}, options, name, def) => {
      if (options.hasOwnProperty(name)) {
        obj[name] = options[name];
      } else if (! obj.hasOwnProperty(name)) {
        obj[name] = typeof def === 'function' ? def() : def;
      }
      return obj;
    },

    forEach(list, visitor) {
      if (! list) return;
      const len = list.length;
      for (let i = 0; i < len; ++i) {
        visitor(list[i], i);
      }
    },

    reverseForEach(list, visitor) {
      if (! list) return;
      for (let i = list.length - 1; i >= 0; --i) {
        visitor(list[i], i);
      }
    },

    map(list, func) {
      const len = list.length;
      const result = new Array(len);
      for (let i = 0; i < len; ++i) {
        result[i] = func(list[i], i);
      }
      return result;
    },

    mapLinkedList(ll, f) {
      const ans = [];
      for (let i = ll; i != null; i = i.next) {
        ans.push(f(i));
      }
      return ans;
    },

    append(list, append) {
      const len = append.length;
      const dl = list.length;
      list.length = dl + len;
      for (let i = 0; i < len; ++i) {
        list[dl + i] = append[i];
      }
      return list;
    },

    /**
     * Only for undefined, null, number, string, boolean, date, array
     * and object. All the immutable types are compared with
     * Object.is. Dates are compared via getTime. Array and Object
     * enumerables with deepEqual.
     *
     * Any other types will always return false.
     */
    deepEqual,

    shallowEqual(array1, array2) {
      if (! Array.isArray(array1) || ! Array.isArray(array2) || array1.length !== array2.length) {
        return false;
      }
      for (let i = 0; i < array1.length; ++i) {
        if (array1[i] !== array2[i]) {
          return false;
        }
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
        for (let i = 0; i < len; ++i) {
          if (pa[i] !== pb[i]) {
            const an = + pa[i] || 0, bn = + pb[i] || 0;
            if (an !== bn) {
              return an > bn ? 1 : -1;
            }
          }
        }

        const an = + ma[2] || 0, bn = + mb[2] || 0;
        if (an !== bn) {
          return an > bn ? 1 : -1;
        }

        return ma[3] === mb[3] ? 0 : ma[3] > mb[3] ? 1 : 1;
      }
      return a > b ? 1 : -1;
    },

    elemMatch(a, b) {
      if (a === null || typeof a !== 'object') {
        return a === b;
      }
      for (const key in a) {
        if (! deepEqual(a[key], b[key])) return false;
      }
      return true;
    },

    invert(map, func) {
      const result = {};
      for (const prop in map) {
        result[map[prop]] = func ? func(prop) : prop;
      }
      return result;
    },

    lookupDottedValue(key, attributes) {
      const parts = typeof key === 'string' ? key.split('.') : key;
      let val = attributes[parts[0]];
      for (let i = 1; val && i < parts.length; ++i) {
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
      for (const key in attrs) {
        let match = false;
        for (let i = 0; i < docs.length; ++i) {
          const doc = docs[i];
          if (key in doc) {
            if (doc[key] != attrs[key]) {
              return false;
            }
            match = true;
            break;
          }
        }
        if (! match) return false;
      }

      return true;
    },

    extractError(err) {
      const st = Stacktrace.normalize(err);
      if (st) {
        if (st.length != 0) {
          if (st[0][7] !== '-') {
            st[0] = '    at -' + st[0].slice(6);
          }
        }
        return (err.toStringPrefix || '') + err.toString() + '\n' + st.join('\n');
      } else {
        return util.inspect(err);
      }
    },

    slice(list, from, to) {
      return slice.call(list, from, to);
    },

    isObjEmpty: (obj) => {
      for (const noop in obj) {return false}
      return true;
    },

    hasOnly: (obj, keyMap) => {
      for (const noop in obj) {
        if (keyMap[noop] === undefined) return false;
      }
      return true;
    },

    keyStartsWith(obj, str) {
      for (const id in obj) if (id.startsWith(str)) return true;
      return false;
    },

    firstParam(obj) {
      if (obj) for (const key in obj) {return obj[key]}
    },

    keyMatches(obj, regex) {
      let m;
      if (obj != null) for (const key in obj) {
        if (m = regex.exec(key)) {
          return m;
        }
      }
      return null;
    },

    addItem(list, item) {
      const pos = util.itemIndex(list, item);
      if (pos !== -1) return pos;
      list.push(item);
    },

    itemIndex(list, item) {
      if (item != null && typeof item === 'object') {
        for (let index = 0; index < list.length; ++index) {
          const row = list[index];
          let found = true;
          for (const key in item) {
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
      for (const key in map) result.push(map[key]);
      return result;
    },

    indexOfRegex(list, value, fieldName) {
      if (! list) return;
      fieldName = fieldName || '_id';
      for (let i = 0; i < list.length; ++i) {
        const row = list[i];
        if (value.test(row[fieldName])) {
          return i;
        }
      }
      return -1;
    },

    pick(map, ...fields) {
      const result = {};
      for (let i = 0; i < fields.length; ++i) {
        const field = fields[i];
        result[field] = map[field];
      }
      return result;
    },

    mapToSearchStr(map) {
      return util.map(
        Object.keys(map),
        (key) => `${util.encodeURIComponent(key)}=${util.encodeURIComponent(map[key])}`,
      ).join('&');
    },

    searchStrToMap(query) {
      const result = {};
      if (! query) return result;
      util.forEach(query.split('&'), (item) => {
        const parts = item.split('=', 2);
        result[util.decodeURIComponent(parts[0])] = util.decodeURIComponent(parts[1]);
      });
      return result;
    },

    encodeURIComponent(value) {
      if (value == null || value === '') return '';

      const result = encodeURIComponent(value);
      // Fix the mismatch between OAuth's  RFC3986's and Javascript
      return result.replace(/\!/g, '%21')
        .replace(/\'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
    },

    decodeURIComponent(value) {
      if (! value) return null;
      return decodeURIComponent(value.replace(
        /(\+|%(?![a-f0-9]{2}))/ig, (m) => m === '+' ? ' ' : '%25'));
    },

    arrayToMap(list) {
      const result = {};
      if (Array.isArray(list)) {
        const len = list.length;
        for (let i = 0; i < len; ++i) result[list[i]] = true;
      }
      return result;
    },

    toMap(keyName, valueName /* lists */) {
      if (arguments.length === 1) {
        return util.arrayToMap(keyName);
      }
      const result = {};
      let func;
      if (valueName == null) {
        func = identity;
      } else {
        switch (typeof (valueName)) {
        case 'string':
        case 'number':
          func = (curr) => curr[valueName];
          break;
        case 'function':
          func = valueName;
          break;
        }
      }
      for (let lc = 2; lc < arguments.length; ++lc) {
        const list = arguments[lc];
        if (! list) continue;

        for (let i = 0; i < list.length; ++i) {
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
      return list && util.map(list, (doc) => doc[fieldName]);
    },

    idNameListToMap(list) {
      const result = {};
      util.forEach(list, (item) => {
        result[item[0]] = item[1];
      });
      return result;
    },

    find(list, func) {
      const len = list.length;
      for (let i = 0; i < len; ++i) {
        const result = list[i];
        if (func(result, i)) return result;
      }
    },

    binarySearch: (list, compare, start=list.length >> 1, lower=0, upper=list.length) => {
      if (upper == 0) return -1;
      if (start < lower) {
        start = lower;
      } else if (start >= upper) start = upper - 1
      for (let ans = compare(list[start]); ans != 0; ans = compare(list[start])) {
        if (upper - 1 <= lower) {
          return ans > 0 && lower == 0
            ? -1
            : ans < 0 && upper == list.length ? list.length - 1 : lower;
        }
        if (ans > 0) {
          upper = start;
        } else {
          lower = start;
        }
        start = ((upper - lower) >> 1) + lower;
      }

      return start;
    },

    flatten(ary, level) {
      const result = [];

      const internal = (a, l) => {
        util.forEach(a, (value) => {
          if (l && Array.isArray(value)) {
            internal(value, l - 1);
          } else {
            result.push(value);
          }
        });
      };

      internal(ary, level === true ? 1 : level || -1);
      return result;
    },

    findBy(list, value, fieldName) {
      if (! list) return;
      fieldName = fieldName || '_id';
      for (let i = 0; i < list.length; ++i) {
        const row = list[i];
        if (row[fieldName] === value) {
          return row;
        }
      }
    },

    indexOf(list, value, fieldName) {
      if (! list) return;
      fieldName = fieldName || '_id';
      for (let i = 0; i < list.length; ++i) {
        const row = list[i];
        if (row[fieldName] === value) {
          return i;
        }
      }
      return -1;
    },

    createDictionary: () => {
      const dict = Object.create(null);
      dict['.;\x00'] = undefined; delete dict['.;\x00'];
      return dict;
    },

    /**
     * Do a shallow copy of a type
     */
    shallowCopy(orig) {
      if (PRIMITIVE[typeof orig] !== undefined || orig === null) return orig;

      const {constructor} = orig;
      if (constructor === Array) {
        return orig.slice();
      }

      if (constructor === Date || constructor === Uint8Array) {
        return new constructor(orig);
      }

      return Object.assign(Object.create(Object.getPrototypeOf(orig)), orig);
    },

    /** Does not deep copy functions */
    deepCopy(orig, maxLevel=util.MAXLEVEL) {
      if (PRIMITIVE[typeof orig] !== undefined || orig === null) return orig;

      if (maxLevel == 0) {
        throw new Error('deepCopy maxLevel exceeded');
      }

      const {constructor} = orig;

      if (constructor === Array) {
        --maxLevel;
        return orig.map((v) => util.deepCopy(v, maxLevel));
      }

      if (constructor === Date || constructor === Uint8Array) {
        return new constructor(orig);
      }

      const copy = Object.create(Object.getPrototypeOf(orig));
      for (const key in orig) copy[key] = util.deepCopy(orig[key], maxLevel - 1);
      return copy;
    },

    intersectp(list1, list2) {
      const set = new Set(list1);

      return list2.some((item) => set.has(item));
    },

    diff(list1, list2) {
      if (! list2) return list1 ? list1.slice() : [];
      const result = [];
      if (! list1) return result;
      const map2 = new Set(list2);
      for (let i = 0; i < list1.length; ++i) {
        const val = list1[i];
        map2.has(val) || result.push(val);
      }
      return result;
    },

    symDiff(list1, list2) {
      const ans = [];
      const map2 = new Set(list2);

      if (list1) for (let i = 0; i < list1.length; ++i) {
        const val = list1[i];
        if (map2.has(val)) {
          map2.delete(val);
        } else {
          ans.push(val);
        }
      }

      for (const val of map2.values()) {
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
      return name + 's';
    },

    humanize(name) {
      name = this.uncapitalize(name);
      return name.replace(/_id$/, '').replace(/[_-]/g, ' ').replace(
        /([A-Z])/g, (_, m1) => ' ' + m1.toLowerCase());
    },

    initials(name, count, abvr) {
      count = count || 3;

      name = (name || '').split(' ');
      let result = '';
      for (let i = 0; count > 1 && i < name.length - 1; ++i, --count) {
        result += name[i].slice(0, 1);
      }
      if (count > 0 && name.length > 0) {
        result += name[name.length - 1].slice(0, 1);
      }

      if (result.length < 2 && abvr) {
        result += name[0].slice(1).replace(/[aeiou]*/ig, '').slice(0, count - 1);
      }

      return result.toUpperCase();
    },

    dasherize(name) {
      return this.humanize(name).replace(/[\s_]+/g, '-');
    },

    labelize(name) {
      return this.capitalize(this.humanize(name));
    },

    sansId(name) {
      return name.replace(/_ids?$/, '');
    },

    trimMatchingSeq(a, b) {
      const al = a.length - 1, bl = b.length - 1;
      const ml = Math.min(al, bl);
      if (ml == -1) return [a, b];

      let i = 0;
      for (;i <= ml; ++i) {
        if (a[i] !== b[i]) break;
      }
      if (i > ml) {
        return [a.slice(i), b.slice(i)];
      }

      const le = ml - i;
      let j = 0;
      for (;j <= le; ++j) {
        if (a[al - j] !== b[bl - j]) break;
      }
      return [a.slice(i, al - j + 1), b.slice(i, bl - j + 1)];
    },

    capitalize(value) {
      if (value == null || value === '') {
        return '';
      }

      return value.charAt(0).toUpperCase() + value.substring(1);
    },

    uncapitalize(value) {
      if (value == null || value === '') {
        return '';
      }

      return value.charAt(0).toLowerCase() + value.substring(1);
    },

    titleize(value) {
      return this.capitalize(value.replace(
        /[-._%+A-Z]\w/g, (w) => ' ' + util.capitalize(w.replace(/^[-._%+]/, ''))).trim());
    },

    camelize(value) {
      return value.replace(/[-._%+A-Z]\w/g, (w) => util.capitalize(w.replace(/^[-._%+]/, '')));
    },

    niceFilename(name) {
      return name && name.toLowerCase().replace(/[^a-zA-Z0-9-]+/g, '-');
    },

    hashToCss(hash) {
      return util.map(Object.keys(hash), (key) => `${key}:${hash[key]}`).join(';');
    },

    pc(fraction) {
      return fraction * 100 + '%';
    },

    toDp(number, dp, zeroFill=false) {
      const scalar = Math.pow(10, dp);
      let decs = '' + (Math.round(number * scalar) % scalar);

      if (! zeroFill && ! decs) {
        return '' + number;
      }

      while (decs.length < dp) {
        decs = '00000'.slice(decs.length - dp) + decs;
      }
      if (! zeroFill) {
        decs = decs.replace(/0+$/, '');
        if (! decs) {
          return '' + Math.round(number);
        }
      }
      return Math.floor(number) + '.' + decs;
    },

    sansPx(value) {return sansSuffix(value, 2)},
    sansPc(value) {return sansSuffix(value, 1)},

    compare,
    compareNumber: (a, b) => a - b,
    compareByName,
    compareByOrder,

    compareByField(field, direction) {
      direction = direction === -1 ? -1 : 1;
      const isSym = typeof field === 'symbol';
      const isId = isSym || field.slice(-3) === '_id';
      const cmp = (a, b) => {
        const afield = a && a[field], bfield = b && b[field];
        const atype = typeorder(afield), btype = typeorder(bfield);
        if (afield === bfield) {
          if (a == null || isSym) return 0;
          const ai = a._id || '', bi = b._id || '';
          return ai === bi ? 0 : ai < bi ? -1 : 1;
        }
        if (atype !== btype) {
          return atype < btype ? -direction : direction;
        }
        return ((atype !== 1 || isId) ? afield < bfield : compare(afield, bfield) < 0)
          ? -direction
          : direction;
      };
      cmp.compareKeys = isSym || field === '_id' ? [field] : [field, '_id'];
      return cmp;
    },

    compareByFields(...fields) {
      const flen = fields.length;
      const compKeys = [], compMethod = [];

      for (let i = 0; i < flen; ++i) {
        const key = fields[i];
        const dir = i + 1 == flen || typeof fields[i + 1] !== 'number' ? 1 : Math.sign(fields[++i]);
        compMethod.push(typeof key !== 'symbol' && key.slice(-3) !== '_id' ? dir * 2 : dir);
        compKeys.push(key);
      }
      const lastKey = compKeys[compKeys.length - 1];
      if (lastKey !== '_id' && typeof lastKey !== 'symbol') {
        compMethod.push(1);
        compKeys.push('_id');
      }
      const clen = compKeys.length;
      const cmp = (a, b) => {
        let dir = 1;
        for (let i = 0; i < clen; ++i) {
          const f = compKeys[i];
          const af = a[f], bf = b[f];
          if (af == null || bf == null ? af !== bf : af.valueOf() !== bf.valueOf()) {
            const atype = typeorder(af), btype = typeorder(bf);
            const dir = compMethod[i];
            if (atype !== btype) {
              return atype < btype ? -dir : dir;
            }
            if (af == null) return -1;
            if (bf == null) return 1;
            if (atype == 1 && (dir < -1 || dir > 1)) {
              return compare(af, bf) < 0 ? -dir : dir;
            }
            return af < bf ? -dir : dir;
          }
        }
        return 0;
      };
      cmp.compareKeys = compKeys;
      return cmp;
    },

    colorToArray,

    setNestedHash(value, hash, ...keys) {
      const last = keys.length - 1;
      for (let i = 0; i < last; ++i) {
        const key = keys[i];
        hash = hash[key] || (hash[key] = {});
      }

      return hash[keys[last]] = value;
    },

    getNestedHash(hash, ...keys) {
      const last = keys.length - 1;
      for (let i = 0; i < last; ++i) {
        const key = keys[i];
        hash = hash[key];
        if (! hash) return undefined;
      }

      return hash[keys[last]];
    },

    deleteNestedHash(hash, ...keys) {
      let last = keys.length - 1;
      const prevs = [];
      for (let i = 0; i < last; ++i) {
        const key = keys[i];
        prevs.push(hash);
        hash = hash[key];
        if (! hash) return undefined;
      }
      prevs.push(hash);

      const value = hash[keys[last]];
      delete hash[keys[last]];

      for (let i = prevs.length - 1; i > 0; --i) {
        for (const noop in prevs[i]) return value;
        delete prevs[i - 1][keys[--last]];
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
        if (dates.length == 0) thread.dates = void 0;
      }
    },

    adjustTime(value, uncertainty=0) {
      timeAdjust += value;
      timeUncertainty = uncertainty;
    },

    get timeAdjust() {return timeAdjust},
    get timeUncertainty() {return timeUncertainty},

    dateNow() {
      return util.thread.date || (Date.now() + timeAdjust);
    },

    newDate() {
      return new Date(util.dateNow());
    },

    dateInputFormat(date) {
      if (date && date.constructor === Date) {
        return date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) +
          '-' + twoDigits(date.getDate());
      }
      return '';
    },

    yyyymmddToDate(value) {
      const m = /^\s*(\d\d\d\d)([\s-/])(\d\d?)\2(\d\d?)\s*$/.exec(value);
      if (! m) return;
      const year = + m[1];
      const month = + m[3] - 1;
      const date = + m[4];
      const res = new Date(year, month, date);

      if (res.getFullYear() === year &&
          res.getMonth() === month &&
          res.getDate() === date) {
        return res;
      }
    },

    twoDigits,

    emailAddress(email, name) {
      return name.replace(/[<>]/g, '') + ' <' + email + '>';
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

    parseEmailAddresses(input='') {
      const addresses = [];

      const remainder = input.replace(
        /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}|(\w *)+<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}>)[,\s]*/ig,
        (_, m1) => (addresses.push(m1), ''),
      );

      return addresses.length > 0 ? {addresses, remainder} : null;
    },

    toHex: (array) => {
      let hex = '';
      for (let i = 0; i < array.length; ++i) {
        const s = array[i].toString(16);
        hex += s.length == 1 ? '0' + s : s;
      }
      return hex;
    },

    withId(object, _id, key=withId$) {
      const assoc = object[key] || (object[key] = Object.create(object));
      if (assoc._id !== _id) assoc._id = _id;
      return assoc;
    },

    indexTolineColumn: (text, index) => {
      let line = 1, i = 0;
      const {length} = text;
      while (true) {
        const n = text.indexOf('\n', i);
        if (n == -1 || n > index) {
          return [line, index - i];
        }
        ++line;
        i = n + 1;
      }
    },

    voidFunc: () => {},
    trueFunc: () => true,

    async asyncArrayFrom(asyncIterator) {
      const arr = [];
      for await (const i of asyncIterator) arr.push(i);
      return arr;
    },
  });

  return util;
});
