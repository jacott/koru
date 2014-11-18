define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var markdownEditorTpl = require('../html!./markdown-editor-test');
  var Dom = require('../dom');
  var util = require('../util');

  TH.initMarkdownEditor = function (v) {
    v.tpl = Dom.newTemplate(util.deepCopy(markdownEditorTpl));

    v.setCaret = function (elm, offset, nocollapse) {
      var range = document.createRange();
      range.selectNode(elm);
      offset && range.setEnd(elm.firstChild, offset);
      nocollapse || range.collapse(! offset);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.getRangeAt(0);
    };
  };

  return TH;
});
