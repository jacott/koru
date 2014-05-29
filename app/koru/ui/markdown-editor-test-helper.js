define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var markdownEditorTpl = require('../html!./markdown-editor-test');
  var Dom = require('../dom');
  var util = require('../util');

  TH.initMarkdownEditor = function (v) {
    v.tpl = Dom.newTemplate(util.deepCopy(markdownEditorTpl));

    v.setCaret = function (elm, offset) {
      var range = document.createRange();
      range.selectNode(elm);
      offset && range.setEnd(elm.firstChild, offset);
      range.collapse(! offset);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return range;
    };
  };

  return TH;
});
