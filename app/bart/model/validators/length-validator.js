define({
  maxLength: function (doc,field,len) {
    if (doc[field] && doc[field].length > len) {
      this.addError(doc,field,'too_long',len);
    }
  },
});
