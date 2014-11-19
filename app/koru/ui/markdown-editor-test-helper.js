define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var markdownEditorTpl = require('../html!./markdown-editor-test');
  var Dom = require('../dom');
  var util = require('../util');

  TH.initMarkdownEditor = function (v) {
    v.tpl = Dom.newTemplate(util.deepCopy(markdownEditorTpl));

    v.setCaret = function (elm, offset, end) {
      var range = document.createRange();
      range.selectNode(elm);
      if (offset != null) {
        if (end != null)
          range.setStart(elm.firstChild, offset);
        range.setEnd(elm.firstChild, end == null ? offset : end);
      }
      if (end == null)
        range.collapse(offset == null);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.getRangeAt(0);
    };

  };

  return TH;
});
