define(() => {
  const iter$ = Symbol();

  const Generator = (function *() {}).constructor;

  class Enumerable {
    constructor(iter) {
      if (iter.constructor === Generator) {
        this[iter$] = {[Symbol.iterator]: iter};
      } else {
        this[iter$] = iter;
      }
    }

    count() {
      let len = 0;
      const iter = this[iter$];
      if (Array.isArray(iter)) return iter.length;
      for (const _ of iter) ++len;
      return len;
    }

    every(test) {
      for (const v of this[iter$])
        if (! test(v)) return false;
      return true;
    }

    some(test) {
      for (const v of this[iter$])
        if (test(v)) return true;
      return false;
    }

    find(test) {
      for (const v of this[iter$])
        if (test(v)) return v;
    }

    map(mapper) {
      const iter = this[iter$];
      return new Enumerable(function *() {
        for (const v of iter) {
          const ans = mapper(v);
          if (ans !== undefined) yield ans;
        }
      });
    }

    filter(test) {
      const self = this;
      return new Enumerable(function *() {
        for (const v of self[iter$]) {
          if (test(v)) yield v;
        }
      });
    }

    reduce(reducer, seed) {
      for (const v of this[iter$]) {
        if (seed === undefined) {
          seed = v;
        } else {
          seed = reducer(seed, v);
        }
      }
      return seed;
    }

    forEach(callback) {
      for (const v of this[iter$]) {
        callback(v);
      }
    }

    get [Symbol.iterator]() {return this[iter$][Symbol.iterator]}

    static count(to, from=1, step=1) {
      return new Enumerable(function *() {
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

    static propertyValues(object) {
      return new Enumerable(function *() {
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
