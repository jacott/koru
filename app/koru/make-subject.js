define(function(require, exports, module) {
  const util  = require('koru/util');

  function makeSubject (
    subject={}, observeName='onChange', notifyName='notify',
    {allStopped, init, stopAllName}={}
  ) {
    let firstOb = true;
    let globalId = 0;
    const observers = util.createDictionary();

    if (stopAllName) {
      subject[stopAllName] = () => {
        firstOb = true;
        for (const key in observers) delete observers[key];
        observersEmpty();
      };
    }

    if (subject[observeName] || subject[notifyName])
      throw new Error('Already a subject');

    subject[observeName] = callback => {
      if (typeof callback !== 'function')
        throw new TypeError('callback is not a function');
      if (firstOb) {
        firstOb = false;
        init && init.call(subject);
      }

      let key = (++globalId).toString(36);
      return observers[key] = {
        callback,
        stop() {
          if (key === undefined) return;
          delete observers[key];
          key = undefined;
          for (const _ in observers) return;
          observersEmpty();
        }
      };
    };

    subject[notifyName] = (...args) => {
      for(const key in observers) {
        observers[key].callback(...args);
      }

      return args[0];
    };

    const observersEmpty = ()=>{
      firstOb = true;
      globalId = 0;
      allStopped && allStopped(subject);
    };

    return subject;
  }

  return makeSubject;
});
