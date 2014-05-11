define({
  extend: function(obj, properties) {
    for(var prop in properties) {
      Object.defineProperty(obj,prop,Object.getOwnPropertyDescriptor(properties,prop));
    }
    return obj;
  },

  regexEscape: function (s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  },

  newEscRegex: function (s) {
    return new RegExp(this.regexEscape(s));
  },
});
