define(function(require, exports, module) {
  const {merge, inspect} = require('koru/util');
  require('./assertions');
  const deepEqual        = require('./core')._u.deepEqual;

  const Stubber = exports;

  let globalCount = 0;
  let globalId = 0;
  const allListeners = Object.create(null);

  const stubProto = merge(Object.create(Function.prototype), {
    returns(arg) {
      this._returns = arg;
      return this;
    },

    throws(arg) {
      this._throws = arg;
      return this;
    },

    yields(...args) {
      this._yields = args;
      return this;
    },

    cancelYields() {
      this._yields = null;
      return this;
    },

    toString() {
      return typeof this.original === 'function' ? this.original.name : this.original === undefined ?
        this.name :
        inspect(this.original, 1);
    },

    withArgs(...args) {
      function spy(...args) {
        return spy.subject.apply(this, args);
      };
      Object.setPrototypeOf(spy, withProto);
      spy._stubId = newId();
      spy.spyArgs = args;
      spy.onCall = this.onCall;
      spy.subject = this;
      (allListeners[this._stubId] || (allListeners[this._stubId] = [])).push(spy);
      return spy;
    },

    onCall(count) {
      function spy(...args) {
        return spy.subject.apply(this, args);
      };
      Object.setPrototypeOf(spy, onCallProto);

      spy._stubId = newId();
      spy.spyCount = count;
      spy.subject = this;
      (allListeners[this._stubId] || (allListeners[this._stubId] = [])).push(spy);
      return spy;
    },

    invoke(thisValue, args) {
      const call = addCall(this, thisValue, args);
      call.returnValue = this._replacement ? this._replacement.apply(thisValue, args) : this._returns;
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    },

    reset() {this._calls = null},

    getCall(index) {
      const {_calls} = this;
      return _calls && _calls[index < 0 ? _calls.length + index : index];
    },

    args(callIndex, index) {
      const {_calls} = this;
      if (! _calls) return;
      const call = _calls[callIndex < 0 ? _calls.length + callIndex : callIndex];
      return call && call.args[index < 0 ? call.args.length + index : index];
    },

    get firstCall() {
      return this._calls && this._calls[0];
    },

    get lastCall() {
      return this._calls && this._calls[this._calls.length - 1];
    },

    get callCount() {return this._calls ? this._calls.length : 0},
    get called() {return !! this._calls && this._calls.length !== 0},
    get calledOnce() {return this._calls && this._calls.length === 1},
    get calledTwice() {return this._calls && this._calls.length === 2},
    get calledThrice() {return this._calls && this._calls.length === 3},

    calledBefore(after) {
      return this.called && after.called &&
        this._calls[0].globalCount < after._calls[0].globalCount;
    },

    calledAfter(before) {
      return this.called && before.called &&
        this._calls[0].globalCount > before._calls[0].globalCount;
    },

    yield(...params) {
      const args = this._calls && this._calls[0] && this._calls[0].args;
      if (! args) throw AssertionError(new Error("Can't yield; stub has not been called"));

      yieldCall(args, params);
    },

    calledWith(...args) {
      return this._calls && this._calls.some(function (list) {
        list = list.args;
        if (list.length > args.length)
          list = list.slice(0, args.length);

        return deepEqual(list, args);
      });
    },

    calledWithExactly(...args) {
      return this._calls && this._calls.some(function (list) {
        list = list.args;
        return deepEqual(list, args);
      });
    },

    printf(format) {
      switch(format) {
      case '%n':
        return this.toString();
      case '%C':
        if (this._calls) {
          return this._calls.map(function (call) {
            return "\n    " + inspect(call.args, 2);
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
      const {args} = call;
      for(let i = 0; i < args.length; ++i) {
        const arg = args[i];
        if (typeof arg === 'function') {
          arg.apply(null, call.yields);
          break;
        }
      }
    }
    return call.returnValue;
  }

  const spyProto = merge(Object.create(stubProto), {
    invoke(thisValue, args) {
      const call = addCall(this, thisValue, args);
      call.returnValue = this.original.apply(thisValue, args);
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    },
  });

  const withProto = merge(Object.create(stubProto), {
    withArgs(...args) {
      return this.subject.withArgs.apply(this.subject, args);
    },

    invoke(call) {
      (this._calls || (this._calls = []))
        .push(call);

      if (this._throws)
        call.throws = this._throws;

      if (this._yields)
        call.yields = this._yields;

      notifyListeners(this, call);

      if (this.hasOwnProperty('_returns'))
        call.returnValue = this._returns;
    },

    toString() {
      return this.subject.toString();
    }
  });

  const onCallProto = merge(Object.create(withProto), {
    onCall(count) {
      return this.subject.onCall.call(this.subject, count);
    },
  });

  const callProto = {
    calledWith(...args) {
      return deepEqual(this.args, args);
    },

    yield(...params) {yieldCall(this.args, params);},
  };

  function yieldCall(args, callParams) {
    for(let i = 0; i < args.length; ++i) {
      const arg = args[i];
      if (typeof arg === 'function') {
        return arg.apply(null, callParams);
      }
    }
    throw AssertionError(new Error("Can't yield; no function in arguments"));
  }

  function notifyListeners(proxy, call, thisValue, args) {
    const listeners = allListeners[proxy._stubId];
    if (listeners) for(let i = 0; i < listeners.length; ++i) {
      const listener = listeners[i];
      const spyCount = listener.spyCount;
      if (spyCount !== undefined) {
        spyCount + 1 === proxy._calls.length && listener.invoke(call);
      } else {
        let j;
        if (arguments.length !== 2) {
          const spyArgs = listener.spyArgs;
          for(j = 0; j < spyArgs.length; ++j) {
            if (! deepEqual(args[j], spyArgs[j])) {
              j = -1;
              break;
            }
          }
        }
        j === -1 || listener.invoke(call);
      }
    }
  }

  function addCall(proxy, thisValue, args) {
    const list = new Array(args.length);
    for(let i = args.length - 1; i >= 0 ; --i) list[i] = args[i];
    const result = Object.create(callProto);
    result.globalCount = ++globalCount;
    result.args = list;
    result.thisValue = thisValue;
    if (proxy._throws) result.throws = proxy._throws;
    if (proxy._yields) result.yields = proxy._yields;
    (proxy._calls || (proxy._calls = []))
      .push(result);
    return result;
  }

  function AssertionError(ex) {
    ex.name = 'AssertionError';
    return ex;
  }

  Stubber.stub = function (object, property, repFunc) {
    let func, desc, orig;
    if (repFunc && typeof repFunc !== 'function')
      throw AssertionError(new Error("Third argument to stub must be a function if supplied"));
    if (object) {
      if (typeof property !== 'string')
        throw AssertionError(new Error(`Invalid stub call: ${inspect(property)} is not a string`));
      if (! (property in object))
        throw AssertionError(new Error(`Invalid stub call: ${inspect(property)} does not exist in ${inspect(object, 1)}`));

      desc = Object.getOwnPropertyDescriptor(object, property);
      orig = desc ? desc.value : object[property];
      if (orig && typeof orig.restore === 'function')
        throw AssertionError(new Error(`Already stubbed ${property}`));
      if (typeof orig === 'function') {
        func = stubFunction(orig, stubProto);
        func._replacement = repFunc;
        repFunc && (func._replacement = repFunc);
      } else {
        if (repFunc) {
          throw AssertionError(new Error("Attempt to stub non function with a function"));
        }

        func = Object.create(stubProto);
      }

      func.original = orig;
      Object.defineProperty(object, property, {value: func, configurable: true});
    } else {
      func = stubFunction(null, stubProto);
      repFunc && (func._replacement = repFunc);
    }
    func.restore = function () {
      restore(object, property, desc, orig, func);
    };

    return func;
  };

  Stubber.spy = function (object, property, func) {
    if (func && typeof func !== 'function')
      throw AssertionError(new Error("third argument to spy must be a function or null"));
    if (object && typeof property === 'string') {
      const desc = Object.getOwnPropertyDescriptor(object, property);
      const orig = desc === undefined ? object[property] : desc.value;
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

    throw AssertionError(new Error("Attempt to spy on non function"));
  };

  Stubber.intercept = function (object, prop, replacement, restore) {
    const orig = Object.getOwnPropertyDescriptor(object, prop);
    if (orig && orig.value && typeof orig.value.restore === 'function')
      throw new Error(`Already stubbed ${prop}`);

    let func;
    if (replacement) {
      if (typeof replacement === 'function') {
         func = function(...args) {
          return replacement.apply(this, args);
        };
      } else {
        func = replacement;
      }
      func._actual = orig && orig.value;
    } else {
      func = function () {};
    }

    Object.defineProperty(object, prop, {configurable: true, value: func,});
    func.restore = function () {
      if (orig) Object.defineProperty(object, prop, orig);
      else delete object[prop];
      restore && restore();
    };
    return func;
  };

  function restore(object, property, desc, orig, func) {
    if (object) {
      if (desc)
        Object.defineProperty(object, property, desc);
      else
        delete object[property];
    }
    delete allListeners[func._stubId];
  }

  function stubFunction(orig, proto) {
    Object.setPrototypeOf(stub, proto);
    orig && merge(stub, orig);
    stub._stubId = newId();
    return stub;
    function stub(...args) {
      return stub.invoke(this, args);
    };
  }

  function newId() {return (++globalId).toString(36)}
});
