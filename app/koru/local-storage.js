define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');

  let observers;
  function storageChanged(event) {
    const keyOb = observers[event.key];
    if (! keyOb) return;

    keyOb.notify(event);
  }

  return {
    setItem(key, value) {
      window.localStorage.setItem(key,value);
    },

    getItem(key) {
      return window.localStorage.getItem(key);
    },

    removeItem(key) {
      window.localStorage.removeItem(key);
    },

    clear() {
      window.localStorage.clear();
    },

    onChange(key, callback) {
      if (! observers) {
        observers = {};
        window.addEventListener('storage', storageChanged);
      }

      const keyOb = observers[key] || (observers[key] = makeSubject());
      return keyOb.onChange(callback);
    },

    clearAllOnChange() {
      observers = null;
      window.removeEventListener('storage', storageChanged);
    },

    get _hasObservers() {return !! observers},

    _storageChanged: storageChanged,
  };
});
