define((require, exports, module)=>{
  'use strict';
  const Observable      = require('koru/observable');

  let observers;
  const storageChanged = event =>{
    if (observers === undefined) return;
    const keyOb = observers[event.key];
    if (keyOb === undefined) return;


    keyOb.notify(event);
  };

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

      const keyOb = observers[key] || (observers[key] = new Observable());
      return keyOb.onChange(callback);
    },

    clearAllOnChange() {
      observers = undefined;
      window.removeEventListener('storage', storageChanged);
    },

    get _hasObservers() {return !! observers},

    _storageChanged: storageChanged,
  };
});
