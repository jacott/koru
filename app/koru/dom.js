define((require)=>{
  const htmlDoc         = require('koru/dom/html-doc');
  const DomTemplate     = require('koru/dom/template');
  const Dom             = require('koru/env!koru/dom/dom');
  const util            = require('koru/util');

  Dom._helpers.join = (...args) => args.join('');

  util.merge(Dom, {
    registerHelpers(helpers) {
      util.merge(this._helpers, helpers);
      return this;
    },

    newTemplate: DomTemplate.newTemplate,

    lookupTemplate(name) {return DomTemplate.lookupTemplate(this, name)},
  });

  return Dom;
});
