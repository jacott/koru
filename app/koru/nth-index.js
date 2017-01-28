define(function(require) {
  const util = require('koru/util');

  class NthIndex {
    constructor(size) {
      this.size = size;
      this.ids = Object.create(null);
    }

    has(...args) {
      let res = this.ids;
      if (res) for (let i = 0; i < args.length; ++i) {
        res = res[args[i]];
        if (! res) return false;
      }

      return !! res;
    }

    get(...args) {
      let res = this.ids;
      if (res) for (let i = 0; i < args.length; ++i) {
        res = res[args[i]];
        if (! res) return;
      }

      return res;
    }

    add(...args) {
      if (args.length !== this.size + 1)
        throw new Error("Expected " + (this.size+1) + ' arguments');

      let res = this.ids;
      const len = this.size - 1;
      let i = 0;
      for(; i < len; ++i) {
        res = res[args[i]] || (res[args[i]] = Object.create(null));
      }

      res[args[i]] = args[i+1];

      return this;
    }

    remove(...args) {
       if (args.length > this.size)
         throw new Error("Expected no more than " + this.size + ' arguments');

      const len = args.length - 1;

      del(0, this.ids);

      function del(idx, res) {
        if (idx >= len || del(idx+1, res[args[idx]]))
          delete res[args[idx]];

        for (let noop in res) {
          return false;
        }
        return true;
      }
    }
  };

  return NthIndex;
});
