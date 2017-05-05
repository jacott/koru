define(function(require, exports, module) {
  const {stubName$}      = require('koru/symbols');
  const {merge, inspect} = require('koru/util');
  require('./assertions');
  const deepEqual        = require('./core')._u.deepEqual;

  const Stubber = exports;

  const yieldsP = Symbol(), throwsP = Symbol(),
        returnsP = Symbol(), idP = Symbol(),
        replacementP = Symbol();

  let globalCount = 0;
  let globalId = 0;
  const allListeners = Object.create(null);

  const stubProto = merge(Object.create(Function.prototype), {
    returns(arg) {
      this[returnsP] = arg;
      return this;
    },

    throws(arg) {
      this[throwsP] = arg;
      return this;
    },

    yields(...args) {
      this[yieldsP] = args;
      return this;
    },

    cancelYields() {
      this[yieldsP] = undefined;
      return this;
    },

    toString() {
      return typeof this.original === 'function' ?
        this.original.name : this.original === undefined ?
        this.name :
        inspect(this.original, 1);
    },

    withArgs(...args) {
      function spy(...args) {return spy.subject.apply(this, args)};
      Object.setPrototypeOf(spy, withProto);
      spy[idP] = newId();
      spy.spyArgs = args;
      spy.onCall = this.onCall;
      spy.subject = this;
      const al = allListeners[this[idP]];
      (al === undefined ? (allListeners[this[idP]] = []) : al).push(spy);
      return spy;
    },

    onCall(count) {
      function spy(...args) {return spy.subject.apply(this, args)};
      Object.setPrototypeOf(spy, onCallProto);

      spy[idP] = newId();
      spy.spyCount = count;
      spy.subject = this;
      const al = allListeners[this[idP]];
      (al === undefined ? (allListeners[this[idP]] = []) : al).push(spy);
      return spy;
    },

    invoke(thisValue, args) {
      const call = addCall(this, thisValue, args);
      call.returnValue = this[replacementP] ?
        this[replacementP].apply(thisValue, args) : this[returnsP];
      notifyListeners(this, call, thisValue, args);

      return invokeReturn(this, call);
    },

    reset() {this.calls = undefined},

    getCall(index) {
      const {calls} = this;
      return calls && calls[index < 0 ? calls.length + index : index];
    },

    args(callIndex, index) {
      const {calls} = this;
      if (calls === undefined) return;
      const call = calls[callIndex < 0 ? calls.length + callIndex : callIndex];
      return call && call.args[index < 0 ? call.args.length + index : index];
    },

    get firstCall() {
      return this.calls === undefined ? undefined : this.calls[0];
    },

    get lastCall() {
      return this.calls === undefined ? undefined : this.calls[this.calls.length - 1];
    },

    get callCount() {return this.calls === undefined ? 0 : this.calls.length},
    get called() {return this.callCount !== 0},
    get calledOnce() {return this.callCount === 1},
    get calledTwice() {return this.callCount === 2},
    get calledThrice() {return this.callCount === 3},

    calledBefore(after) {
      return this.called && after.called &&
        this.calls[0].globalCount < after.calls[0].globalCount;
    },

    calledAfter(before) {
      return this.called && before.called &&
        this.calls[0].globalCount > before.calls[0].globalCount;
    },

    yield(...params) {
      const {firstCall} = this;
      const args = this.firstCall === undefined ? undefined : firstCall.args;
      if (args === undefined)
        throw AssertionError(new Error("Can't yield; stub has not been called"));

      yieldCall(args, params);
    },

    calledWith(...args) {
      return this.calls !== undefined && this.calls.some(list => {
        list = list.args;
        if (list.length > args.length)
          list = list.slice(0, args.length);

        return deepEqual(list, args);
      });
    },

    calledWithExactly(...args) {
      return this.calls !== undefined && this.calls.some(list => deepEqual(list.args, args));
    },

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
    },
  });

  const invokeReturn = (stub, call) => {
    if (call.throws !== undefined) throw call.throws;
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
      (this.calls === undefined ? (this.calls = []) : this.calls)
        .push(call);

      if (this[throwsP] !== undefined)
        call.throws = this[throwsP];

      if (this[yieldsP] !== undefined)
        call.yields = this[yieldsP];

      notifyListeners(this, call);

      if (this.hasOwnProperty(returnsP))
        call.returnValue = this[returnsP];
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

  const yieldCall = (args, callParams) => {
    for(let i = 0; i < args.length; ++i) {
      const arg = args[i];
      if (typeof arg === 'function') {
        return arg.apply(null, callParams);
      }
    }
    throw AssertionError(new Error("Can't yield; no function in arguments"));
  };

  const notifyListeners = (proxy, call, thisValue, args) => {
    const listeners = allListeners[proxy[idP]];
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

  const addCall = (proxy, thisValue, args) => {
    const list = new Array(args.length);
    for(let i = args.length - 1; i >= 0 ; --i) list[i] = args[i];
    const result = Object.create(callProto);
    result.globalCount = ++globalCount;
    result.args = list;
    result.thisValue = thisValue;
    if (proxy[throwsP] !== undefined) result.throws = proxy[throwsP];
    if (proxy[yieldsP] !== undefined) result.yields = proxy[yieldsP];
    const {calls} = proxy;
    (calls === undefined ? (proxy.calls = []) : calls).push(result);
    return result;
  };

  const AssertionError = (ex) => {
    ex.name = 'AssertionError';
    return ex;
  };

  Stubber.stub = (object, property, repFunc) => {
    let func, desc, orig;
    if (repFunc !== undefined && typeof repFunc !== 'function')
      throw AssertionError(new Error("Third argument to stub must be a function if supplied"));
    if (object != null && typeof object !== 'string') {

      if (typeof property !== 'string')
        throw AssertionError(new Error(
          `Invalid stub call: ${inspect(property)} is not a string`));
      if (! (property in object))
        throw AssertionError(new Error(
          `Invalid stub call: ${inspect(property)} does not exist in ${inspect(object, 1)}`));

      desc = Object.getOwnPropertyDescriptor(object, property);
      orig = desc !== undefined ? desc.value : object[property];
      if (orig !== undefined && typeof orig.restore === 'function')
        throw AssertionError(new Error(`Already stubbed ${property}`));
      if (typeof orig === 'function') {
        func = stubFunction(orig, stubProto);
        func[replacementP] = repFunc;
        if (repFunc !== undefined) func[replacementP] = repFunc;
      } else {
        if (repFunc !== undefined) {
          throw AssertionError(new Error("Attempt to stub non function with a function"));
        }

        func = Object.create(stubProto);
      }

      func.original = orig;
      Object.defineProperty(object, property, {value: func, configurable: true});
    } else {
      func = stubFunction(null, stubProto);
      if (repFunc !== undefined) func[replacementP] = repFunc;
      if (object != null)
        func[stubName$] = object;
    }
    func.restore = function () {
      restore(object, property, desc, orig, func);
    };

    return func;
  };

  Stubber.spy = (object, property, func) => {
    if (func !== undefined && typeof func !== 'function')
      throw AssertionError(new Error("third argument to spy must be a function or null"));
    if (object != null && typeof property === 'string') {
      const desc = Object.getOwnPropertyDescriptor(object, property);
      const orig = desc === undefined ? object[property] : desc.value;
      if (typeof orig === 'function') {
        if (func === undefined) func = stubFunction(orig, spyProto);
        func.original = orig;

        Object.defineProperty(object, property, {value: func, configurable: true});
        func.restore = () => {restore(object, property, desc, orig, func)};
        return func;
      }
    }

    throw AssertionError(new Error("Attempt to spy on non function"));
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

  Stubber.isStubbed = func => func != null && func[idP] !== undefined;

  const restore = (object, property, desc, orig, func) => {
    if (object != null) {
      if (desc !== undefined)
        Object.defineProperty(object, property, desc);
      else
        delete object[property];
    }
    delete allListeners[func[idP]];
  };

  const stubFunction = (orig, proto) => {
    Object.setPrototypeOf(stub, proto);
    orig && merge(stub, orig);
    stub[idP] = newId();
    return stub;
    function stub(...args) {
      return stub.invoke(this, args);
    };
  };

  const newId = () => (++globalId).toString(36);
});
