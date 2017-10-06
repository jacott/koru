define(function(require, exports, module) {
  const {stubName$}     = require('koru/symbols');
  const {merge, inspect, hasOwn} = require('koru/util');
  require('./assertions');
  const deepEqual       = require('./core')._u.deepEqual;

  const Stubber = exports;

  const {AssertionError} = this;

  const yields$ = Symbol(), throws$ = Symbol(), invokes$ = Symbol(),
        returns$ = Symbol(), id$ = Symbol(),
        replacement$ = Symbol();

  let globalCount = 0;
  let globalId = 0;
  const allListeners = Object.create(null);

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
      if (callback !== undefined && typeof callback !== 'function')
        throw new Error('invokes argument not a function');
      this[invokes$] = callback;
      return this;
    }

    cancelYields() {
      this[yields$] = undefined;
      return this;
    }

    toString() {
      return typeof this.original === 'function' ?
        this.original.name : this.original === undefined ?
        this.name :
        inspect(this.original, 1);
    }

    withArgs(...args) {
      function spy(...args) {return spy.subject.apply(this, args)};
      Object.setPrototypeOf(spy, With.prototype);
      spy[id$] = newId();
      spy.spyArgs = args;
      spy.onCall = this.onCall;
      spy.subject = this;
      const al = allListeners[this[id$]];
      (al === undefined ? (allListeners[this[id$]] = []) : al).push(spy);
      return spy;
    }

    onCall(count) {
      function spy(...args) {return spy.subject.apply(this, args)};
      Object.setPrototypeOf(spy, OnCall.prototype);

      spy[id$] = newId();
      spy.spyCount = count;
      spy.subject = this;
      const al = allListeners[this[id$]];
      (al === undefined ? (allListeners[this[id$]] = []) : al).push(spy);
      return spy;
    }

    invoke(thisValue, args) {
      const call = new Call(this, thisValue, args);
      call.returnValue = this[replacement$] ?
        this[replacement$].apply(thisValue, args) : this[returns$];
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    }

    reset() {this.calls = undefined}

    getCall(index) {
      const {calls} = this;
      return calls && calls[index < 0 ? calls.length + index : index];
    }

    args(callIndex, index) {
      const {calls} = this;
      if (calls === undefined) return;
      const call = calls[callIndex < 0 ? calls.length + callIndex : callIndex];
      return call && call.args[index < 0 ? call.args.length + index : index];
    }

    get firstCall() {
      return this.calls === undefined ? undefined : this.calls[0];
    }

    get lastCall() {
      return this.calls === undefined ? undefined : this.calls[this.calls.length - 1];
    }

    get callCount() {return this.calls === undefined ? 0 : this.calls.length}
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

    yield(...params) {
      const {firstCall} = this;
      const args = this.firstCall === undefined ? undefined : firstCall.args;
      if (args === undefined)
        throw new AssertionError("Can't yield; stub has not been called");

      return yieldCall(args, params);
    }

    yieldAndReset(...params) {
      const args = this.firstCall === undefined ? undefined : this.firstCall.args;
      if (args === undefined)
        throw new AssertionError("Can't yield; stub has not been called");
      this.reset();
      return yieldCall(args, params);
    }

    yieldAll(...params) {
      const {calls} = this;
      if (calls === undefined)
        throw new AssertionError("Can't yield; stub has not been called");
      const {length} = calls;
      for(let i = 0; i < length; ++i) {
        calls[i].yield(...params);
      }
      return this;
    }

    calledWith(...args) {
      return this.calls !== undefined && this.calls.some(list => {
        list = list.args;
        if (list.length > args.length)
          list = list.slice(0, args.length);

        return deepEqual(list, args);
      });
    }

    calledWithExactly(...args) {
      return this.calls !== undefined && this.calls.some(list => deepEqual(list.args, args));
    }

    printf(format) {
      switch(format) {
      case '%n':
        return this.toString();
      case '%C':
        return this.calls !== undefined ?
          this.calls.map(call => "\n    " + inspect(call.args, 2)).join("")
          : "";
      default:
        return inspect(this.calls, 2);
      }
    }
  }

  const invokeReturn = (stub, call) => {
    if (call.throws !== undefined) throw call.throws;
    if (call.invokes !== undefined) return call.invokes(call);
    if (call.yields !== undefined) {
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
  };

  class Spy extends Stub {
    invoke(thisValue, args) {
      const call = new Call(this, thisValue, args);
      call.returnValue = this.original.apply(thisValue, args);
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    }
  }

  class With extends Stub {
    withArgs(...args) {
      return this.subject.withArgs.apply(this.subject, args);
    }

    invoke(call) {
      (this.calls === undefined ? (this.calls = []) : this.calls)
        .push(call);

      if (this[throws$] !== undefined)
        call.throws = this[throws$];

      if (this[yields$] !== undefined)
        call.yields = this[yields$];

      if (this[invokes$] !== undefined)
        call.invokes = this[invokes$];

      notifyListeners(this, call);

      if (hasOwn(this, returns$))
        call.returnValue = this[returns$];
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
      if (proxy[throws$] !== undefined) this.throws = proxy[throws$];
      if (proxy[yields$] !== undefined) this.yields = proxy[yields$];
      if (proxy[invokes$] !== undefined) this.invokes = proxy[invokes$];
      const {calls} = proxy;
      (calls === undefined ? (proxy.calls = []) : calls).push(this);
    };

    calledWith(...args) {
      return deepEqual(this.args, args);
    }

    yield(...params) {yieldCall(this.args, params)}
  }

  const yieldCall = (args, callParams) => {
    for(let i = 0; i < args.length; ++i) {
      const arg = args[i];
      if (typeof arg === 'function') {
        return arg.apply(null, callParams);
      }
    }
    throw new AssertionError("Can't yield; no function in arguments");
  };

  const notifyListeners = (proxy, call, thisValue, args) => {
    const listeners = allListeners[proxy[id$]];
    if (listeners !== undefined) for(let i = 0; i < listeners.length; ++i) {
      const listener = listeners[i];
      const spyCount = listener.spyCount;
      if (spyCount !== undefined) {
        spyCount + 1 === proxy.calls.length && listener.invoke(call);
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
  };

  Stubber.stub = (object, property, repFunc) => {
    let func, desc, orig;
    if (repFunc !== undefined && typeof repFunc !== 'function')
      throw new AssertionError("Third argument to stub must be a function if supplied");
    if (object != null && typeof object !== 'string' && ! (
      typeof object === 'function' && property === undefined &&
        repFunc === undefined)) {
        if (typeof property !== 'string')
          throw new AssertionError(
            `Invalid stub call: ${inspect(property)} is not a string`);
        if (! (property in object))
          throw new AssertionError(
            `Invalid stub call: ${inspect(property)} does not exist in ${inspect(object, 1)}`);

        desc = Object.getOwnPropertyDescriptor(object, property);
        orig = desc !== undefined ? desc.value : object[property];
        if (orig !== undefined && typeof orig.restore === 'function')
          throw new AssertionError(`Already stubbed ${property}`);
        if (typeof orig === 'function') {
          func = stubFunction(orig, Stub.prototype);
          func[replacement$] = repFunc;
          if (repFunc !== undefined) func[replacement$] = repFunc;
        } else {
          if (repFunc !== undefined) {
            throw new AssertionError("Attempt to stub non function with a function");
          }

          func = Object.create(Stub.prototype);
        }

        func.original = orig;
        Object.defineProperty(object, property, {value: func, configurable: true});
    } else {
      if (typeof object === 'function')
        repFunc = object;
      func = stubFunction(null, Stub.prototype);
      if (repFunc !== undefined) func[replacement$] = repFunc;
      if (object != null)
        func[stubName$] = object;
    }
    func.restore = () => {restore(object, property, desc, orig, func)};

    return func;
  };

  Stubber.spy = (object, property, func) => {
    if (func !== undefined && typeof func !== 'function')
      throw new AssertionError("third argument to spy must be a function or null");
    if (object != null && typeof property === 'string') {
      const desc = Object.getOwnPropertyDescriptor(object, property);
      const orig = desc === undefined ? object[property] : desc.value;
      if (typeof orig === 'function') {
        if (func === undefined) func = stubFunction(orig, Spy.prototype);
        func.original = orig;

        Object.defineProperty(object, property, {value: func, configurable: true});
        func.restore = () => {restore(object, property, desc, orig, func)};
        return func;
      }
    }

    throw new AssertionError("Attempt to spy on non function");
  };

  Stubber.intercept = (object, prop, replacement, restore) => {
    const orig = Object.getOwnPropertyDescriptor(object, prop);
    if (orig !== undefined && orig.value !== undefined && typeof orig.value.restore === 'function')
      throw new Error(`Already stubbed ${prop}`);

    let func;
    if (replacement !== undefined) {
      if (typeof replacement === 'function') {
         func = function(...args) {
          return replacement.apply(this, args);
        };
      } else {
        func = replacement;
      }
      func._actual = orig && orig.value;
    } else {
      func = () => {};
    }

    Object.defineProperty(object, prop, {configurable: true, value: func,});
    func.restore = () => {
      if (orig !== undefined) Object.defineProperty(object, prop, orig);
      else delete object[prop];
      restore && restore();
    };
    return func;
  };

  Stubber.isStubbed = func => func != null && func[id$] !== undefined;

  const restore = (object, property, desc, orig, func) => {
    if (object != null) {
      if (desc !== undefined)
        Object.defineProperty(object, property, desc);
      else
        delete object[property];
    }
    delete allListeners[func[id$]];
  };

  const stubFunction = (orig, proto) => {
    function stub(...args) {return stub.invoke(this, args)};
    Object.setPrototypeOf(stub, proto);
    orig && merge(stub, orig);
    stub[id$] = newId();
    return stub;
  };

  const newId = () => (++globalId).toString(36);
});
