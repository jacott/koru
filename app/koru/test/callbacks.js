define(['./core', '../main'], function (geddon, koru) {
  const callbacks = {};

  registerCallBack('start');
  registerCallBack('end');
  registerCallBack('testStart');
  registerCallBack('testEnd');


  function registerCallBack(name) {
    const capped = name[0].toUpperCase()+name.slice(1);
    geddon['cancel'+capped] = deregister;
    function deregister(func) {
      callbacks[name] = callbacks[name].filter(i => {
        return i !== func;
      });
    }
    geddon['on'+capped] = function(module, func) {
      if (func) {
        koru.onunload(module, () => deregister(func));
      } else {
        func = module;
      }
      (callbacks[name] = callbacks[name] || []).push(func);
    };
  }


  geddon.runCallBacks = function(name, test) {
    const cbs = callbacks[name];

    let firstEx;

    if (cbs) for(let i = cbs.length - 1; i >= 0; --i) {
      try {
        cbs[i](test);
      } catch(ex) {
        firstEx = firstEx || ex;
        koru.unhandledException(ex);
      }
    }

    if (firstEx) throw firstEx;
  };
});
