define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const LinkedList      = require('koru/linked-list');
  const Core            = require('koru/test/core');

  const callbacks = {};

  const sameValue = (node, value)=> node.value === value;

  const registerCallBack = (name, forward=false) =>{
    const capped = name[0].toUpperCase()+name.slice(1);
    const deregister = func =>{
      let prev = undefined;
      const list = callbacks[name];
      if (list === undefined || list.remove === undefined) return;
      list.remove(sameValue, func);
    };
    Core['on'+capped] = (module, func)=>{
      if (func) {
        module.onUnload(() => deregister(func));
      } else {
        func = module;
      }
      const list = callbacks[name] || (callbacks[name] = new LinkedList);
      forward ? list.addBack(func) : list.addFront(func);
    };
    Core['cancel'+capped] = deregister;
  };

  registerCallBack('start', true);
  registerCallBack('end');
  registerCallBack('testStart', true);
  registerCallBack('testEnd');

  Core.runCallBacks = (name, test)=>{
    const cbs = callbacks[name];
    if (cbs === undefined) return;

    let firstEx;
    for (let node = cbs.front; node !== undefined; node = node.next) {
      try {
        node.value(test);
      } catch(ex) {
        if (firstEx === undefined) firstEx = ex;
        koru.unhandledException(ex);
      }
    }

    if (firstEx !== undefined) throw firstEx;
  };
});
