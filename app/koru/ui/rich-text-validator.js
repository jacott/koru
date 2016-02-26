define(function(require, exports, module) {
  var util = require('koru/util');
  var RichText = require('./rich-text');

  return {
    richText: function (doc, field, options) {
      var changes = doc.changes;
      if (changes && ! changes.hasOwnProperty(field))
        return;

      var val = doc[field];

      if (typeof val === 'string')
        return;

      if (Array.isArray(val[0]))
        val[0] = val[0].join("\n");



      if (options === 'filter') {
        filter(val);
        if (val[1] === null)
          doc[field] = val[0];
        return;
      }

      if (RichText.isValid(val[0], val[1])) {
        if (val[1] == null) doc[field] = val[0];
        return;
      }

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

      if (options === 'filter') {
        var rt = [val, markup];
        filter(rt);
        if (rt[0] !== val) doc[field] = rt[0];
        if (! util.deepEqual(rt[1], markup)) doc[markupField] = rt[1];
        return;
      }

      if (RichText.isValid(val, markup))
        return;

      return this.addError(doc,field+'HTML','invalid_html');
    },
  };

  function filter(val) {
    if (val[0] == null && val[1] == null) return;

    var html = RichText.toHtml(val[0], val[1], document.createElement('div'));
    var rt = RichText.fromHtml(html);

    val[0] = rt[0];
    val[1] = rt[1];
  }
});
