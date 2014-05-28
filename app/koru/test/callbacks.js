define(['./core'], function (geddon) {
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

    for(var i=0;i < cbs.length;++i) {
      cbs[i](test);
    }
  };
});
