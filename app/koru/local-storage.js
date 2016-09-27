define({
  setItem(key, value) {
    window.localStorage.setItem(key,value);
  },

  getItem(key) {
    return window.localStorage.getItem(key);
  },

  removeItem(key) {
    window.localStorage.removeItem(key);
  },
});
