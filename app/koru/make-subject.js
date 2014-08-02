define(['module', './main'], function(module, koru) {
  koru.onunload(module, 'reload');
  return  function (subject, observeName, notifyName) {
    observeName = observeName || 'onChange';
    notifyName = notifyName || 'notify';
    var allStopped = subject['allStopped_'+observeName];
    var init = subject['init_'+observeName];

    var key = 0;
    var observers = {};

    subject['stopAll_'+observeName] = function () {
      key = 0;
      observers = {};
      allStopped && allStopped.call(subject);
    };

    subject[observeName] = function (func) {
      key === 0 && init && init.call(subject);

      observers[++key] = func;
      return stopFunc(key);
    };

    subject[notifyName] = function (first) {
      for(var i in observers) {
        observers[i].apply(subject, arguments);
      }

      return first;
    };

    return subject;

    function stopFunc(cKey) {
      return {
        key: cKey,
        stop: function () {
          delete observers[cKey];
          for(var i in observers) return;
          key = 0;
          allStopped && allStopped.call(subject);
        }
      };
    }
  };
});
