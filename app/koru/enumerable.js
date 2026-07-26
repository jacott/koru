define(() => {
  const iter$ = Symbol();

  const Generator = (function* () {}).constructor;

  const INVALID = () => {
    throw new Error('Invalid iterator');
  };

  const DONE = Object.freeze({value: undefined, done: true});

  class Enumerable {
    constructor(iter) {
      if (typeof iter?.next === 'function') {
        this[iter$] = iter;
      } else if (iter?.constructor === Generator) {
        this[iter$] = iter();
      } else if (typeof iter?.[Symbol.iterator] === 'function') {
        this[iter$] = iter[Symbol.iterator]();
      } else {
        INVALID();
      }
    }

    next() {
      return this[iter$].next();
    }

    [Symbol.iterator]() {
      return this;
    }

    count() {
      const iter = this[iter$];
      let count = 0;
      while (!iter.next().done) ++count;
      return count;
    }

    every(test) {
      const iter = this[iter$];
      let n;
      while (!(n = iter.next()).done) {
        if (!test(n.value)) return false;
      }
      return true;
    }

    some(test) {
      const iter = this[iter$];
      let n;
      while (!(n = iter.next()).done) {
        if (test(n.value)) return true;
      }
      return false;
    }

    find(test) {
      const iter = this[iter$];
      let n;
      while (!(n = iter.next()).done) {
        if (test(n.value)) return n.value;
      }
    }

    filterMap(mapper) {
      let iter = this[iter$];
      this[iter$] = {
        next: () => {
          let n;
          while (!(n = iter.next()).done) {
            const value = mapper(n.value);
            if (value !== undefined) {
              return {value, done: false};
            }
          }
          return n;
        },
      };
      return this;
    }

    filter(test) {
      let iter = this[iter$];
      this[iter$] = {
        next: () => {
          let n;
          while (!(n = iter.next()).done) {
            if (test(n.value)) return n;
          }
          return n;
        },
      };
      return this;
    }

    skip(n) {
      let iter = this[iter$];
      let skipped = false;
      this[iter$] = {
        next: () => {
          if (!skipped) {
            skipped = true;
            while (n-- > 0 && !iter.next().done) {}
          }
          return iter.next();
        },
      };
      return this;
    }

    take(n) {
      let iter = this[iter$];
      this[iter$] = {
        next: () => {
          let x;
          if (n > 0 && !(x = iter.next()).done) {
            --n;
            return x;
          }
          return DONE;
        },
      };
      return this;
    }

    reduce(reducer, seed) {
      const iter = this[iter$];
      let hasSeed = arguments.length > 1;
      let n;
      while (!(n = iter.next()).done) {
        if (!hasSeed) {
          seed = n.value;
          hasSeed = true;
        } else {
          seed = reducer(seed, n.value);
        }
      }
      return seed;
    }

    forEach(callback) {
      const iter = this[iter$];
      let n;
      while (!(n = iter.next()).done) {
        callback(n.value);
      }
    }

    toObject(callback) {
      const object = {};

      const iter = this[iter$];
      let n;
      while (!(n = iter.next()).done) {
        callback(object, n.value);
      }
      return object;
    }

    static asArray(object) {
      if (Array.isArray(object)) {
        return object;
      }
      if (object == null) {
        return [];
      }
      if (object[Symbol.iterator] !== undefined) {
        return Array.from(object);
      }
      if (typeof object === 'object') {
        const result = [];
        for (const name in object) {
          result.push(object[name]);
        }
        return result;
      }
      return [object];
    }

    static mapObjectToArray(object, mapper) {
      let i = -1;
      const result = [];
      for (const name in object) {
        const ans = mapper(name, object[name], ++i);
        if (ans !== void 0) result.push(ans);
      }
      return result;
    }

    static *mapObjectIter(object, mapper) {
      let i = -1;
      for (const name in object) {
        const ans = mapper(name, object[name], ++i);
        if (ans !== void 0) yield [name, ans];
      }
    }

    static count(to, from = 1, step = 1) {
      return new Enumerable(function* () {
        for (let i = from; i <= to; i += step) yield i;
      });
    }

    static mapToArray(iter, mapper) {
      const result = [];
      for (const item of iter) {
        const ans = mapper(item);
        if (ans !== void 0) result.push(ans);
      }
      return result;
    }

    static propertyKeys(object) {
      return new Enumerable(function* () {
        for (const key in object) yield key;
      });
    }

    static propertyValues(object) {
      return new Enumerable(function* () {
        for (const key in object) yield object[key];
      });
    }

    static *reverseValues(object) {
      for (let i = object.length - 1; i >= 0; --i) {
        yield object[i];
      }
    }
  }

  return Enumerable;
});
