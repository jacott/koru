define(['module', './main'], function(module, koru) {

  return  function (subject, observeName, notifyName) {
    observeName = observeName || 'onChange';
    notifyName = notifyName || 'notify';
    const allStopped = subject['allStopped_'+observeName];
    const init = subject['init_'+observeName];

    let firstOb = true;
    const observers = new Set;

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

      const obj = handle(func);
      observers.add(obj);

      return obj;
    };

    subject[notifyName] = function (first) {
      for(const handle of observers) {
        handle.function.apply(handle, arguments);
      }

      return first;
    };

    return subject;

    function handle(func) {
      let key = {
        function: func,
        stop() {
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
