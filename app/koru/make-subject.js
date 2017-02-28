define(['module', './main'], function(module, koru) {
  return function makeSubject(subject, observeName, notifyName) {
    observeName = observeName || 'onChange';
    notifyName = notifyName || 'notify';
    const allStopped = subject['allStopped_'+observeName];
    const init = subject['init_'+observeName];

    let firstOb = true;
    const observers = new Set;

    subject['stopAll_'+observeName] = () => {
      firstOb = true;
      observers.clear();
      allStopped && allStopped.call(subject);
    };

    subject[observeName] = callback => {
      if (firstOb) {
        firstOb = false;
        init && init.call(subject);
      }

      const obj = handle(callback);
      observers.add(obj);

      return obj;
    };

    subject[notifyName] = (...args) => {
      for(let handle of observers) {
        handle.function(...args);
      }

      return args[0];
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
