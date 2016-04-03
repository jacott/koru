define(function(require, exports, module) {
  var util = require('koru/util');
  var core = require('./core');
  var assertions = require('./assertions');

  var deepEqual = core._u.deepEqual;
  var inspect = util.inspect;

  var globalCount = 0;
  var globalId = 0;
  var allListeners = {};

  var stubProto = util.extend(Object.create(Function.prototype), {
    returns: function (arg) {
      this._returns = arg;
      return this;
    },

    throws: function (arg) {
      this._throws = arg;
      return this;
    },

    yields: function () {
      var args = new Array(arguments.length);
      for(var i = arguments.length - 1; i >= 0 ; --i) args[i] = arguments[i];
      this._yields = args;
      return this;
    },

    toString: function () {
      return typeof this.original === 'function' ? this.original.name : this.original === undefined ?
        this.name :
        util.inspect(this.original, 1);
    },

    withArgs: function () {
      var args = new Array(arguments.length);
      for(var i = arguments.length - 1; i >= 0 ; --i) args[i] = arguments[i];
      var spy = function() {
        return spy.subject.apply(this, arguments);
      };
      Object.setPrototypeOf(spy, withProto);
      spy._stubId = "-";
      spy.spyArgs = args;
      spy.subject = this;
      (allListeners[this._stubId] || (allListeners[this._stubId] = [])).push(spy);
      return spy;
    },

    onCall: function (count) {
      var spy = function() {
        return spy.subject.apply(this, arguments);
      };
      Object.setPrototypeOf(spy, withProto);
      spy._stubId = "-";
      spy.spyCount = count;
      spy.subject = this;
      (allListeners[this._stubId] || (allListeners[this._stubId] = [])).push(spy);
      return spy;
    },

    invoke: function (thisValue, args) {
      var call = addCall(this, thisValue, args);
      call.returnValue = this._replacement ? this._replacement.apply(thisValue, args) : this._returns;
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    },

    reset: function () {this._calls = null},

    getCall: function (index) {
      return this._calls && this._calls[index];
    },

    args: function (callIndex, index) {
      var call = this._calls && this._calls[callIndex];
      return call && call.args[index];
    },

    get firstCall() {
      return this._calls && this._calls[0];
    },

    get lastCall() {
      return this._calls && this._calls[this._calls.length - 1];
    },

    get callCount() {return this._calls ? this._calls.length : 0},
    get called() {return this._calls && this._calls.length !== 0},
    get calledOnce() {return this._calls && this._calls.length === 1},
    get calledTwice() {return this._calls && this._calls.length === 2},
    get calledThrice() {return this._calls && this._calls.length === 3},

    calledBefore: function (after) {
      return this.called && after.called &&
        this._calls[0].globalCount < after._calls[0].globalCount;
    },

    calledAfter: function (before) {
      return this.called && before.called &&
        this._calls[0].globalCount > before._calls[0].globalCount;
    },

    yield: function () {
      var args = this._calls && this._calls[0] && this._calls[0].args;
      if (args) {
        for(var i = 0; i < args.length; ++i) {
          var arg = args[i];
          if (typeof arg === 'function') {
            return arg.apply(null, arguments);
          }
        }

      }
    },

    calledWith: function () {
      var args = new Array(arguments.length);
      for(var i = arguments.length - 1; i >= 0 ; --i) args[i] = arguments[i];
      return this._calls && this._calls.some(function (list) {
        list = list.args;
        if (list.length > args.length)
          list = list.slice(0, args.length);

        return deepEqual(list, args);
      });
    },

    calledWithExactly: function () {
      var args = new Array(arguments.length);
      for(var i = arguments.length - 1; i >= 0 ; --i) args[i] = arguments[i];
      return this._calls && this._calls.some(function (list) {
        list = list.args;
        return deepEqual(list, args);
      });
    },

    printf: function (format) {
      switch(format) {
      case '%n':
        return this.toString();
      case '%C':
        var calls = this._calls;
        if (calls) {
          return calls.map(function (call) {
            return "\n    " + call.args.map(function (arg) {return util.inspect(arg, 1)}).join(", ");
          }).join("");
        }
        return "";
      default:
        return inspect(this._calls, 2);
      }
    },
  });

  function invokeReturn(stub, call) {
    if (call.throws)
      throw call.throws;
    if (call.yields) {
      var args = call.args;
      for(var i = 0; i < args.length; ++i) {
        var arg = args[i];
        if (typeof arg === 'function') {
          arg.apply(null, call.yields);
          break;
        }
      }
    }
    return call.returnValue;
  }

  var spyProto = util.extend(Object.create(stubProto), {
    invoke: function (thisValue, args) {
      var call = addCall(this, thisValue, args);
      call.returnValue = this.original.apply(thisValue, args);
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    },
  });

  var withProto = util.extend(Object.create(stubProto), {
    withArgs: function () {
      return this.subject.withArgs.apply(this.subject, arguments);
    },

    onCall: function (count) {
      return this.subject.onCall.call(this.subject, count);
    },

    invoke: function (call) {
      (this._calls || (this._calls = []))
        .push(call);

      if (this._throws)
        call.throws = this._throws;

      if (this._yields)
        call.yields = this._yields;

      if (this.hasOwnProperty('_returns'))
        call.returnValue = this._returns;
    },
    toString: function () {
      return this.subject.toString();
    }
  });

  var callProto = {
    calledWith: function () {
      var args = new Array(arguments.length);
      for(var i = arguments.length - 1; i >= 0 ; --i) args[i] = arguments[i];
      return deepEqual(this.args, args);
    },
  };

  function notifyListeners(proxy, call, thisValue, args) {
    var listeners = allListeners[proxy._stubId];
    if (listeners) for(var i = 0; i < listeners.length; ++i) {
      var listener = listeners[i];
      var spyCount = listener.spyCount;
      if (spyCount !== undefined) {
        spyCount + 1 === proxy._calls.length && listener.invoke(call);
      } else {
        var spyArgs = listener.spyArgs;
        for(var j = 0; j < spyArgs.length; ++j) {
          if (! deepEqual(args[j], spyArgs[j])) {
            j = -1;
            break;
          }
        }
        j === -1 || listener.invoke(call);
      }
    }
  }

  function addCall(proxy, thisValue, args) {
    var list = new Array(args.length);
    for(var i = args.length - 1; i >= 0 ; --i) list[i] = args[i];
    var result = Object.create(callProto);
    result.globalCount = ++globalCount;
    result.args = list;
    result.thisValue = thisValue;
    if (proxy._throws) result.throws = proxy._throws;
    if (proxy._yields) result.yields = proxy._yields;
    (proxy._calls || (proxy._calls = []))
      .push(result);
    return result;
  }

  exports.stub = function (object, property, repFunc) {
    if (repFunc && typeof repFunc !== 'function')
      throw new Error("third argument to stub must be a function or null");
    if (object) {
      if (typeof property !== 'string')
        throw new Error(inspect(property) + "is not a string");
      if (! (property in object))
        throw new Error(inspect(property) + "does not exist in "+inspect(object, 1));

      var desc = Object.getOwnPropertyDescriptor(object, property);
      var orig = desc ? desc.value : object[property];
      if (typeof orig === 'function') {
        var func = stubFunction(orig, stubProto);
        func._replacement = repFunc;
      } else {
        if (repFunc) {
          throw new Error("Attempt to stub non function with a function");
        }

        var func = Object.create(stubProto);
      }

      func.original = orig;
      Object.defineProperty(object, property, {value: func, configurable: true});
    } else {
      var func = stubFunction(null, stubProto);
    }
    func.restore = function () {
      restore(object, property, desc, orig, func);
    };

    return func;
  };

  exports.spy = function (object, property, func) {
    if (func && typeof func !== 'function')
      throw new Error("third argument to spy must be a function or null");
    if (object && typeof property === 'string') {
      var desc = Object.getOwnPropertyDescriptor(object, property);
      var orig = desc === undefined ? object[property] : desc.value;
      if (typeof orig === 'function') {
        func || (func = stubFunction(orig, spyProto));
        func.original = orig;

        Object.defineProperty(object, property, {value: func, configurable: true});
        func.restore = function () {
          restore(object, property, desc, orig, func);
        };
        return func;
      }
    }

    throw new Error("Attempt to spy on non function");
  };

  function restore(object, property, desc, orig, func) {
    object && Object.defineProperty(object, property, desc || {value: orig, configurable: true});
    delete allListeners[func._stubId];
  }

  function stubFunction(orig, proto) {
    Object.setPrototypeOf(stub, proto);
    orig && util.extend(stub, orig);
    stub._stubId = (++globalId).toString(36);
    return stub;
    function stub() {
      return stub.invoke(this, arguments);
    };
  }
});