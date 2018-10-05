define(()=>{
  const iter$ = Symbol();

  class Enumerable {
    constructor(iter) {
      this[iter$] = iter;
    }

    count() {
      let len = 0;
      const iter = this[iter$];
      if (Array.isArray(iter)) return iter.length;
      for (const _ of iter) ++len;
      return len;
    }

    *map(mapper) {for (const v of this[iter$]) yield mapper(v)}

    reduce(reducer, seed) {
      for (const v of this[iter$]) {
        if (seed === undefined) seed = v;
        else
          seed = reducer(seed, v);
      }
      return seed;
    }

    static *count(to, from=1, step=1) {
      for(let i = from; i <= to; i+=step) yield i;
    }
  }

  return Enumerable;
});
