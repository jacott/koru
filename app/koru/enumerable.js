define(()=>{
  const iter$ = Symbol();

  const Generator = (function *() {}).constructor;

  class Enumerable {
    constructor(iter) {
      if (iter.constructor === Generator)
        this[iter$] = {[Symbol.iterator]: iter};
      else
        this[iter$] = iter;
    }

    count() {
      let len = 0;
      const iter = this[iter$];
      if (Array.isArray(iter)) return iter.length;
      for (const _ of iter) ++len;
      return len;
    }

    map(mapper) {
      const self = this;
      return new Enumerable(function *() {
        for (const v of self[iter$]) {
          const ans = mapper(v);
          if (ans !== undefined) yield ans;
        }
      });
    }

    reduce(reducer, seed) {
      for (const v of this[iter$]) {
        if (seed === undefined) seed = v;
        else
          seed = reducer(seed, v);
      }
      return seed;
    }

    forEach(callback) {
      for (const v of this[iter$]) {
        callback(v);
      }
    }

    static count(to, from=1, step=1) {
      return new Enumerable(function *() {
        for(let i = from; i <= to; i+=step) yield i;
      });
    }

    get [Symbol.iterator]() {return this[iter$][Symbol.iterator]}

    static propertyValues(object) {
      return new Enumerable(function *() {
        for (const key in object) yield object[key];
      });
    }
  }

  return Enumerable;
});
