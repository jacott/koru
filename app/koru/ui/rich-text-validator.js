define((require)=>{
  'use strict';
  const Changes         = require('koru/changes');
  const util            = require('koru/util');
  const RichText        = require('./rich-text');


  const filter = (val)=>{
    if (val[0] == null && val[1] == null) return;

    const html = RichText.toHtml(val[0], val[1], document.createElement('div'));
    const rt = RichText.fromHtml(html);

    val[0] = rt[0];
    val[1] = rt[1];
  };

  return {
    richText(doc, field, options) {
      const {changes} = doc;
      if (changes != null && ! Changes.has(changes, field))
        return;

      const val = doc[field];


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

      return this.addErrorIfNone(doc, field, 'invalid_html');
    },

    richTextMarkup(doc, field, options) {
      const markupField = field;
      field = markupField.slice(0, -6);
      const {changes} = doc;
      if (changes == null || (
        ! Changes.has(changes, field) && ! Changes.has(changes, markupField)))
        return;


      const val = doc[field];
      const markup = doc[markupField];

      if (options === 'filter') {
        const rt = [val, markup];
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
});
