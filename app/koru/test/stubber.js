define(function(require, exports, module) {
  var util = require('koru/util');
  var core = require('./core');
  var assertions = require('./assertions');

  var deepEqual = core._u.deepEqual;
  var inspect = util.inspect;

  var base = {
    returns: function (arg) {
      this._returnArg = arg;
      return this;
    },

    invoke: function (thisValue, args) {
      getArgs(this).push(args);
      return this._returnArg;
    },

    called: function () {
      return getArgs.length !== 0;
    },

    calledWith: function () {
      var args = util.slice(arguments);
      return getArgs(this).some(function (list) {
        _koru_.debug('X', inspect(list, 1));

        if (list.length > args)
          list = list.slice(0, args.length);
        return deepEqual(args, list);
      });
    },

    printf: function () {
      return "FIXME";
    },
  };

  function getArgs(proxy) {
    return proxy.args || (proxy.args = []);
  }

  exports.stub = function (object, property, func) {
    if (func && typeof func !== 'function')
      throw new Error("third argument to stub must be a function or null");
    if (object && typeof property === 'string') {
      var desc = Object.getOwnPropertyDescriptor(object, property);
      desc = desc ? desc.length : object[property];
      if (! desc) throw new Error(inspect(property) + "does not exist in "+inspect(object));
      if (typeof desc === 'function') {
        func || (func = stubFunction(desc.length));
        util.extend(func, base);
      } else {
        if (func) {
          throw new Error("Attempt to stub non function with a function");
        }

        func = Object.create(base);
      }

      Object.defineProperty(object, property, {value: func});
    } else {
      func = stubFunction(0);
      util.extend(func, base);
    }

    return func;
  };



  function stubFunction(length) {
    var f;
    if (length) {
      var args = [];
      for(var i = 0; i < length; ++i) {
        args.push('a'+i);
      }

      eval("f = function("+args.join(",")+
           ") {return f.invoke(this, arguments)}");
    } else {
      f = function () {return f.invoke(this, arguments)};
    }
    return f;
  }
});
