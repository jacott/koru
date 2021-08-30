define((require) => {
  'use strict';
  const {stubName$}     = require('koru/symbols');
  const {merge, inspect, hasOwn} = require('koru/util');
  const {deepEqual}     = require('./core');

  const listeners$ = Symbol(),
        invokes$ = Symbol(), yields$ = Symbol(), throws$ = Symbol(),
        returns$ = Symbol(),
        replacement$ = Symbol();

  let globalCount = 0;

  class Stub extends Function {
    returns(arg) {
      this[returns$] = arg;
      return this;
    }

    throws(arg) {
      this[throws$] = arg;
      return this;
    }

    yields(...args) {
      this[yields$] = args;
      return this;
    }

    invokes(callback) {
      if (callback !== void 0 && typeof callback !== 'function') {
        throw new Error('invokes argument not a function');
      }
      this[invokes$] = callback;
      return this;
    }

    cancelYields() {
      this[yields$] = undefined;
      return this;
    }

    toString() {
      return typeof this.original === 'function'
        ? this.original.name
        : (this.original === void 0 ? this.name : inspect(this.original, 1));
    }

    withArgs(...args) {
      function spy(...args) {return spy.subject.apply(this, args)}
      Object.setPrototypeOf(spy, With.prototype);
      spy[listeners$] = [];
      spy.spyArgs = args;
      spy.onCall = this.onCall;
      spy.subject = this;
      this[listeners$].push(spy);
      return spy;
    }

    onCall(count) {
      function spy(...args) {return spy.subject.apply(this, args)}
      Object.setPrototypeOf(spy, OnCall.prototype);

      spy[listeners$] = [];
      spy.spyCount = count;
      spy.subject = this;
      this[listeners$].push(spy);
      return spy;
    }

    invoke(thisValue, args) {
      const call = new Call(this, thisValue, args);
      call.returnValue = this[replacement$]
        ? this[replacement$].apply(thisValue, args)
        : this[returns$];
      notifyListeners(this, call, args);

      return invokeReturn(this, call);
    }

    yield(...args) {
      const {firstCall} = this;
      const callArgs = this.firstCall?.args;
      if (callArgs === void 0) {
        assert.fail("Can't yield; stub with callback has not been called", 1);
      }

      return yieldCall(callArgs, args);
    }

    yieldAndReset(...args) {
      const callArgs = this.firstCall?.args;
      if (callArgs === void 0) {
        assert.fail("Can't yield; stub has not been called", 1);
      }
      this.reset();
      return yieldCall(callArgs, args);
    }

    yieldAll(...args) {
      const {calls} = this;
      if (calls === void 0) {
        assert.fail("Can't yield; stub has not been called", 1);
      }
      const {length} = calls;
      for (let i = 0; i<length; ++i) {
        calls[i].yield(...args);
      }
      return this;
    }

    reset() {this.calls = void 0}

    getCall(index) {
      const {calls} = this;
      return calls && calls[index<0 ? calls.length + index : index];
    }

    args(callIndex, index) {
      const {calls} = this;
      if (calls === void 0) return;
      const call = calls[callIndex<0 ? calls.length + callIndex : callIndex];
      return call && call.args[index<0 ? call.args.length + index : index];
    }

    get firstCall() {
      return this.calls?.[0];
    }

    get lastCall() {
      return this.calls?.at(-1);
    }

    get callCount() {return this.calls === void 0 ? 0 : this.calls.length}
    get called() {return this.callCount !== 0}
    get calledOnce() {return this.callCount === 1}
    get calledTwice() {return this.callCount === 2}
    get calledThrice() {return this.callCount === 3}

    calledBefore(after) {
      return this.called && after.called &&
        this.calls[0].globalCount < after.calls[0].globalCount;
    }

    calledAfter(before) {
      return this.called && before.called &&
        this.calls[0].globalCount > before.calls[0].globalCount;
    }

    calledWith(...args) {
      return this.calls !== void 0 && this.calls.some((list) => {
        list = list.args;
        if (list.length > args.length) {
          list = list.slice(0, args.length);
        }

        return deepEqual(list, args);
      });
    }

    calledWithExactly(...args) {
      return this.calls !== void 0 && this.calls.some((list) => deepEqual(list.args, args));
    }

    printf(format) {
      switch (format) {
      case '%n':
        return this.toString();
      case '%C':
        return this.calls !== void 0
          ? this.calls.map((call) => '\n    ' + inspect(call.args, 10)).join('')
          : '';
      default:
        return inspect(this.calls, 2);
      }
    }
  }

  const invokeReturn = (stub, call) => {
    if (call.invokes !== void 0) return call.returnValue = call.invokes(call);
    if (call.yields !== void 0) {
      const {args} = call;
      for (let i = 0; i < args.length; ++i) {
        const arg = args[i];
        if (typeof arg === 'function') {
          arg.apply(null, call.yields);
          break;
        }
      }
    }
    if (call.throws !== void 0) throw call.throws;
    return call.returnValue;
  };

  class Spy extends Stub {
    invoke(thisValue, args) {
      const call = new Call(this, thisValue, args);
      call.returnValue = this.original.apply(thisValue, args);
      notifyListeners(this, call, args);

      return invokeReturn(this, call);
    }
  }

  class With extends Stub {
    withArgs(...args) {
      return this.subject.withArgs.apply(this.subject, args);
    }

    invoke(call) {
      (this.calls === void 0 ? (this.calls = []) : this.calls)
        .push(call);

      if (this[invokes$] !== void 0) {
        call.invokes = this[invokes$];
      }

      if (this[yields$] !== void 0) {
        call.yields = this[yields$];
      }

      if (this[throws$] !== void 0) {
        call.throws = this[throws$];
      }

      notifyListeners(this, call);

      if (hasOwn(this, returns$)) {
        call.returnValue = this[returns$];
      }
    }

    toString() {
      return this.subject.toString();
    }
  }

  class OnCall extends With {
    onCall(count) {
      return this.subject.onCall.call(this.subject, count);
    }
  }

  class Call {
    constructor(proxy, thisValue, args) {
      this.globalCount = ++globalCount;
      this.args = args.slice();
      this.thisValue = thisValue;
      if (proxy[invokes$] !== void 0) this.invokes = proxy[invokes$];
      if (proxy[yields$] !== void 0) this.yields = proxy[yields$];
      if (proxy[throws$] !== void 0) this.throws = proxy[throws$];
      const {calls} = proxy;
      (calls === void 0 ? (proxy.calls = []) : calls).push(this);
    }

    calledWith(...args) {
      let list = this.args;
      if (list.length > args.length) {
        list = list.slice(0, args.length);
      }
      return deepEqual(list, args);
    }

    yield(...args) {yieldCall(this.args, args)}
  }

  const yieldCall = (args, callArgs) => {
    for (let i = 0; i < args.length; ++i) {
      const arg = args[i];
      if (typeof arg === 'function') {
        return arg.apply(null, callArgs);
      }
    }
    assert.fail("Can't yield; no function in arguments", 1);
  };

  const notifyListeners = (proxy, call, args) => {
    const listeners = proxy[listeners$];
    if (listeners !== void 0) for (let i = 0; i < listeners.length; ++i) {
      const listener = listeners[i];
      const spyCount = listener.spyCount;
      if (spyCount !== void 0) {
        spyCount+1 === proxy.calls.length && listener.invoke(call);
      } else {
        let j;
        if (args !== void 0) {
          const spyArgs = listener.spyArgs;
          for (j = 0; j < spyArgs.length; ++j) {
            if (! deepEqual(args[j], spyArgs[j])) {
              j = -1;
              break;
            }
          }
        }
        j === -1 || listener.invoke(call);
      }
    }
  };

  const restore = (object, property, desc, orig, func) => {
    if (object != null) {
      if (desc !== void 0) {
        Object.defineProperty(object, property, desc);
      } else {
        delete object[property];
      }
    }
    func[listeners$] = void 0;
  };

  const stubFunction = (orig, proto) => {
    function stub(...args) {return stub.invoke(this, args)}
    Object.setPrototypeOf(stub, proto);
    orig && merge(stub, orig);
    stub[listeners$] = [];
    return stub;
  };

  return {
    stub: (object, property, repFunc) => {
      let func, desc, orig;
      if (repFunc !== void 0 && typeof repFunc !== 'function') {
        throw new Error('Third argument to stub must be a function if supplied');
      }
      if (object != null && typeof object !== 'string' && ! (
        typeof object === 'function' && property === void 0 &&
          repFunc === void 0)) {
        if (typeof property !== 'string' && typeof property !== 'symbol') {
          throw new Error(
            `Invalid stub call: ${inspect(property)} is not a string`);
        }
        if (! (property in object)) {
          throw new Error(
            `Invalid stub call: ${inspect(property)} does not exist in ${inspect(object, 1)}`);
        }

        desc = Object.getOwnPropertyDescriptor(object, property);
        orig = desc !== void 0 ? desc.value : object[property];
        if (orig !== void 0 && typeof orig.restore === 'function') {
          throw new Error(`Already stubbed ${property}`);
        }
        if (typeof orig === 'function') {
          func = stubFunction(orig, Stub.prototype);
          func[replacement$] = repFunc;
          if (repFunc !== void 0) func[replacement$] = repFunc;
        } else {
          if (repFunc !== void 0) {
            throw new Error('Attempt to stub non function with a function');
          }

          func = Object.create(Stub.prototype);
        }

        func.original = orig;
        Object.defineProperty(object, property, {value: func, configurable: true});
      } else {
        if (typeof object === 'function') {
          repFunc = object;
        }
        func = stubFunction(null, Stub.prototype);
        if (repFunc !== void 0) func[replacement$] = repFunc;
        if (object != null) {
          func[stubName$] = object;
        }
      }
      func.restore = () => {restore(object, property, desc, orig, func)};

      return func;
    },

    spy: (object, property) => {
      if (object != null && typeof property === 'string') {
        const desc = Object.getOwnPropertyDescriptor(object, property);
        const orig = desc === void 0 ? object[property] : desc.value;
        if (typeof orig === 'function') {
          const func = stubFunction(orig, Spy.prototype);
          func.original = orig;

          Object.defineProperty(object, property, {value: func, configurable: true});
          func.restore = () => {restore(object, property, desc, orig, func)};
          return func;
        }
      }

      throw new Error('Attempt to spy on non function');
    },

    intercept: (object, prop, replacement=() => {}, restore) => {
      const orig = Object.getOwnPropertyDescriptor(object, prop);
      if (orig !== void 0 && orig.value !== void 0 && typeof orig.value.restore === 'function') {
        throw new Error(`Already stubbed ${prop}`);
      }

      if ('_actual' in replacement) {
        throw new Error('replacement may not have an _actual property');
      }
      if ('restore' in replacement) {
        throw new Error('replacement may not have an restore property');
      }

      replacement._actual = orig?.value;

      Object.defineProperty(object, prop, {configurable: true, value: replacement});
      replacement.restore = () => {
        if (orig !== void 0) {
          Object.defineProperty(object, prop, orig);
        } else {
          delete object[prop];
        }
        restore?.();
      };
      return replacement;
    },

    isStubbed: (func) => func != null && func[listeners$] !== void 0,
  };
});
