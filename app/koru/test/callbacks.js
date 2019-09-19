define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const LinkedList      = require('koru/linked-list');
  const Core            = require('koru/test/core');

  const callbacks = {};

  const sameValue = (node, value)=> node.value === value;

  const registerCallBack = (name, append=false) =>{
    const capped = name[0].toUpperCase()+name.slice(1);
    const deregister = func =>{
      let prev = void 0;
      const list = callbacks[name];
      if (list === void 0 || list.remove === void 0) return;
      list.remove(sameValue, func);
    };
    Core['on'+capped] = (module, func)=>{
      if (func) {
        module.onUnload(() => deregister(func));
      } else {
        func = module;
      }
      const list = callbacks[name] || (callbacks[name] = new LinkedList);
      append ? list.addBack(func) : list.addFront(func);
    };
    Core['cancel'+capped] = deregister;
  };

  registerCallBack('start', true);
  registerCallBack('end');
  registerCallBack('testStart', true);
  registerCallBack('testEnd');

  const runAsyncCallbacks = async (node, test)=>{
    for (; node !== void 0; node = node.next) await node.value(test);
  };

  Core.runCallBacks = (name, test)=>{
    const cbs = callbacks[name];
    if (cbs === void 0) return;

    for (let node = cbs.front; node !== void 0; node = node.next) {
      const promise = node.value(test);
      if (promise !== void 0) {
        if (typeof promise.then !== 'function') throw "wrongReturn";
        return promise.then(()=>{runAsyncCallbacks(node.next, test)});
      }
    }
  };
});
