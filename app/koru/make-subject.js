define(['module', './main'], function(module, koru) {
  koru.onunload(module, 'reload');
  return  function (subject, observeName, notifyName) {
    observeName = observeName || 'onChange';
    notifyName = notifyName || 'notify';
    var allStopped = subject['allStopped_'+observeName];
    var init = subject['init_'+observeName];

    var firstOb = true;
    var observers = new Set;

    subject['stopAll_'+observeName] = function () {
      firstOb = true;
      observers.clear();
      allStopped && allStopped.call(subject);
    };

    subject[observeName] = function (func) {
      if (firstOb) {
        firstOb = false;
        init && init.call(subject);
      }

      var obj = handle(func);
      observers.add(obj);

      return obj;
    };

    subject[notifyName] = function (first) {
      var result = first;
      for(var handle of observers) {
        handle.function.apply(handle, arguments);
      }

      return result;
    };

    return subject;

    function handle(func) {
      var key = {
        function: func,
        stop: function () {
          if (! key) return;
          observers.delete(key);
          if (observers.length) return;
          firstOb = true;
          key = null;
          allStopped && allStopped.call(subject);
        }
      };
      return key;
    }
  };
});
