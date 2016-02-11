define(function(require, exports, module) {
  var util = require('koru/util');
  var RichText = require('./rich-text');

  return {
    richText: function (doc, field, options) {
      var changes = doc.changes;
      if (! changes || ! changes.hasOwnProperty(field))
        return;

      var val = doc[field];

      if (typeof val === 'string')
        return;

      if (Array.isArray(val[0]))
        val[0] = val[0].join("\n");

      if (RichText.isValid(val[0], val[1]))
        return;


      return this.addError(doc, field, 'invalid_html');
    },

    richTextMarkup: function (doc, field, options) {
      var markupField = field;
      field = markupField.slice(0, -6);
      var changes = doc.changes;
      if (! changes) return;
      if (! changes.hasOwnProperty(field) && ! changes.hasOwnProperty(markupField))
        return;


      var val = doc[field];
      var markup = doc[markupField];

      if (RichText.isValid(val, markup))
        return;

      return this.addError(doc,field+'HTML','invalid_html');
    },
  };
});
