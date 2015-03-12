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
      document.body.textContent = '';
      v = null;
    },

    "test construction": function () {
      var df = document.createDocumentFragment();

      var elm = document.createElement('div');
      elm.textContent = "hello world";

      assert.same(elm.nodeType, 1);
      assert.same(elm.nodeType, document.ELEMENT_NODE);

      var elm2 = elm.cloneNode(true);
      elm2.appendChild(document.createTextNode(' alderaan'));
      assert.same(elm.outerHTML, "<div>hello world</div>");
      assert.same(elm2.outerHTML, "<div>hello world alderaan</div>");


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

      elm.id = "top123";
      elm.className = "un deux trois";

      top.appendChild(df);

      assert.same(top.innerHTML, '<div id="top123" class="un deux trois">hello world<foo alt="baz" bold="bold">bar</foo></div>');

      assert.same(top.textContent, 'hello worldbar');
    },

    "test innerHTML": function () {
      var elm = document.createElement('div');
      elm.innerHTML = v.exp = '<div id="top123" class="un deux trois">hello world<foo alt="baz" bold="bold">bar<br>baz</foo></div>';
      assert.same(elm.innerHTML, v.exp);
      assert.same(elm.firstChild.id, "top123");
      assert.same(elm.firstChild.firstChild.textContent, 'hello world');
    },
  });
});
