define({
  regexEscape: function (s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  },

  newEscRegex: function (s) {
    return new RegExp(this.regexEscape(s));
  },
});
