define(['./core', '../main'], (Core, koru)=>{
  const callbacks = {};

  const registerCallBack = name =>{
    const capped = name[0].toUpperCase()+name.slice(1);
    const deregister = func =>{
      callbacks[name] = callbacks[name].filter(i => {
        return i !== func;
      });
    };
    Core['on'+capped] = (module, func)=>{
      if (func) {
        koru.onunload(module, () => deregister(func));
      } else {
        func = module;
      }
      (callbacks[name] = callbacks[name] || []).push(func);
    };
    Core['cancel'+capped] = deregister;
  };

  registerCallBack('start');
  registerCallBack('end');
  registerCallBack('testStart');
  registerCallBack('testEnd');

  Core.runCallBacks = (name, test)=>{
    const cbs = callbacks[name];

    let firstEx;

    if (cbs) for(let i = cbs.length - 1; i >= 0; --i) {
      try {
        cbs[i](test);
      } catch(ex) {
        if (firstEx === undefined) firstEx = ex;
        koru.unhandledException(ex);
      }
    }

    if (firstEx !== undefined) throw firstEx;
  };
});
