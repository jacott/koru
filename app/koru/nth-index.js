define(function(require) {
  const util = require('koru/util');

  class NthIndex {
    constructor (size) {
      this.size = size;
      this.ids = Object.create(null);
    }

    has (/* args */) {
      var res = this.ids;
      for(var i = 0; res && i < arguments.length; ++i) {
        res = res[arguments[i]];
      }

      return !! res;
    }

    get (/* args */) {
      var res = this.ids;
      for(var i = 0; res && i < arguments.length; ++i) {
        res = res[arguments[i]];
      }

      return res;
    }

    add (/* args, value */) {
      if (arguments.length !== this.size + 1)
        throw new Error("Expected " + (this.size+1) + ' arguments');

      var res = this.ids;
      var len = this.size - 1;
      for(var i = 0; i < len; ++i) {
        res = res[arguments[i]] || (res[arguments[i]] = Object.create(null));
      }

      res[arguments[i]] = arguments[i+1];

      return this;
    }

    remove (/* args, value */) {
       if (arguments.length > this.size)
         throw new Error("Expected no more than " + this.size + ' arguments');

      var args = arguments;
      var len = args.length - 1;

      del(0, this.ids);

      function del(idx, res) {
        if (idx >= len || del(idx+1, res[args[idx]]))
          delete res[args[idx]];

        for (var noop in res) {
          return false;
        }
        return true;
      }
    }
  };

  return NthIndex;
});
