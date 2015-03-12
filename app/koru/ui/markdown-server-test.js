define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var HtmlDoc = require('./html-doc');
  var sut = require('./markdown');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test simple": function () {
      var dom = sut.toHtml('Hello @[Josiah<JG>](j2) **bold**');
      assert.same(dom.outerHTML, 'Hello <span data-a="j2">Josiah&lt;JG&gt;</span> <b>bold</b>');
    },
  });
});
