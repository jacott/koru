define({
  setItem: function (key, value) {
    window.localStorage.setItem(key,value);
  },

  getItem: function (key) {
    return window.localStorage.setItem(key);
  },

  removeItem: function (key) {
    window.localStorage.removeItem(key);
  },
});
