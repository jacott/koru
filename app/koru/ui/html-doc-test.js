define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./html-doc');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test construction": function () {
      var df = document.createDocumentFragment();

      var elm = document.createElement('div');
      elm.textContent = "hello world";

      assert.same(elm.nodeType, 1);
      assert.same(elm.nodeType, document.ELEMENT_NODE);

      assert.same(elm.outerHTML, "<div>hello world</div>");

      var foo = document.createElement('foo');
      foo.textContent = 'bar';
      foo.setAttribute('alt', 'baz');
      foo.setAttribute('bold', 'bold');
      assert.same(foo.getAttribute('alt'), 'baz');

      elm.appendChild(foo);
      assert.same(elm.lastChild, foo);
      assert.same(foo.parentNode, elm);

      df.appendChild(elm);

      var top = document.createElement('section');

      top.appendChild(df);

      assert.same(top.innerHTML, '<div>hello world<foo alt="baz" bold="bold">bar</foo></div>');

    },
  });
});
