define((require) => {
  'use strict';
  const htmlDoc         = require('koru/dom/html-doc');
  const Template        = require('koru/dom/template');
  const Dom             = require('koru/env!koru/dom/dom');
  const util            = require('koru/util');

  Dom._helpers.join = (...args) => args.join('');

  util.merge(Dom, {
    registerHelpers(helpers) {
      util.merge(this._helpers, helpers);
      return this;
    },

    newTemplate: Template.newTemplate.bind(Template),

    lookupTemplate(name) {return Template.lookupTemplate(this.tpl, name)},
  });

  return Dom;
});
