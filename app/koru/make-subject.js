define(['module', './main'], function(module, koru) {
  return function makeSubject(
    subject={}, observeName='onChange', notifyName='notify',
    {allStopped, init, stopAllName}={}
  ) {
    let firstOb = true;
    const observers = new Set;

    if (stopAllName) {
      subject[stopAllName] = () => {
        firstOb = true;
        observers.clear();
        allStopped && allStopped(subject);
      };
    }

    subject[observeName] = callback => {
      if (typeof callback !== 'function')
        throw new TypeError('callback is not a function');
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
          if (key === null) return;
          observers.delete(key);
          for (const o of observers) return;
          firstOb = true;
          key = null;
          allStopped && allStopped(subject);
        }
      };
      return key;
    }
  };
});
