define(['./core', '../main'], function (geddon, koru) {
  var callbacks = {};

  geddon.onStart = registerCallBack('start');
  geddon.onEnd = registerCallBack('end');
  geddon.onTestStart = registerCallBack('testStart');
  geddon.onTestEnd = registerCallBack('testEnd');


  function registerCallBack(name) {
    return function(func) {
      (callbacks[name] = callbacks[name] || []).push(func);
    };
  }


  geddon.runCallBacks = function(name, test) {
    var cbs = callbacks[name] || [];

    var firstEx;

    for(var i=0;i < cbs.length;++i) {
      try {
        cbs[i](test);
      } catch(ex) {
        firstEx = firstEx || ex;
        koru.error(koru.util.extractError(ex));
      }
    }

    if (firstEx) throw firstEx;
  };
});
