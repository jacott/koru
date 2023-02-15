define((require, exports, module) => {
  'use strict';
  const Dom             = require('koru/dom');
  const util            = require('koru/util');

  const {TEXT_NODE} = document;

  const INLINE_TAGS = util.toMap(
    'A ABBR AUDIO B BDI BDO BUTTON CANVAS CITE CODE DATA DATALIST DEL DFN EM EMBED FONT I IFRAME IMG INPUT INS KBD LABEL MAP MARK MATHML MATH METER NOSCRIPT OBJECT OUTPUT PICTURE PROGRESS Q RUBY RT RP S SAMP SELECT SLOT SMALL SPAN STRONG SUB SUP SVG TEMPLATE TEXTAREA TIME TT U VAR VIDEO WBR'
      .split(' '));

  return {
    INLINE_TAGS,
    isInlineNode: (item) => item.nodeType === TEXT_NODE || !! INLINE_TAGS[item.tagName],
  };
});
