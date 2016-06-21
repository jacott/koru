define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test');
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
      assert.same(elm.className, '');

      elm.className = "un deux trois";
      assert.same(elm.className, "un deux trois");

      top.appendChild(df);

      assert.sameHtml(top.innerHTML, '<div id="top123" class="un deux trois">hello world<foo alt="baz" bold="bold">bar</foo></div>');

      assert.same(top.textContent, 'hello worldbar');
    },

    "test style backgroundColor": function () {
      var top = document.createElement('div');
      assert.same(top.style.backgroundColor, '');
      top.style.backgroundColor = '#ffff00';
      assert.same(top.style.backgroundColor, 'rgb(255, 255, 0)');
      assert.same(top.getAttribute('style'), 'background-color: rgb(255, 255, 0);');
    },

    "test style.cssText": function () {
      var top = document.createElement('div');
      top.setAttribute('style', 'color:#ff0000;font-weight:bold');
      assert.same(top.style.color, 'rgb(255, 0, 0)');
      assert.same(top.style.fontWeight, 'bold');
      assert.same(top.style['font-weight'], 'bold');
      assert.same(top.style.cssText, 'color: rgb(255, 0, 0); font-weight: bold;');
      assert.same(top.getAttribute('style'), 'color:#ff0000;font-weight:bold');
      top.style.fontWeight = 'normal';
      assert.same(top.getAttribute('style'), 'color: rgb(255, 0, 0); font-weight: normal;');
      top.style.textDecoration = 'underline';
      assert.match(top.style.item(2), /^text-decoration/);
      assert.same(top.getAttribute('style'), 'color: rgb(255, 0, 0); font-weight: normal; text-decoration: underline;');
      assert.same(top.style.textAlign, '');
      assert.same(top.outerHTML, '<div style="color: rgb(255, 0, 0); font-weight: normal; text-decoration: underline;"></div>');
      top.style.fontFamily = 'foo bar';
      assert.match(top.style.cssText, /^color: rgb\(255, 0, 0\); font-weight: normal; text-decoration: underline; font-family: ['"]?foo bar["']?;$/);
    },

    "test insertBefore": function () {
      var top = document.createElement('div');

      var b = document.createElement('b');
      top.appendChild(b);
      var i = document.createElement('i');
      top.insertBefore(i, b);
      top.insertBefore(i, b);

      var frag = document.createDocumentFragment();
      frag.appendChild(document.createElement('x1'));
      frag.appendChild(document.createElement('x2'));

      top.insertBefore(frag, b);

      assert.sameHtml(top.innerHTML, '<i></i><x1></x1><x2></x2><b></b>');
    },

    "test innerHTML": function () {
      var elm = document.createElement('div');
      elm.innerHTML = v.exp = '<div id="top123" class="un deux trois">hello &lt;world&#62;<foo alt="baz" bold="bold">bar<br>baz</foo></div>';
      assert.same(elm.firstChild.id, "top123");
      assert.same(elm.firstChild.firstChild.textContent, 'hello <world>');
      assert.same(elm.innerHTML, v.exp.replace(/&#62/, '&gt'));
    },

    "test HTML entities": function () {
      var div = document.createElement('div');
      div.innerHTML = "&lt;&QUOT;&quot;&gt;&#39;&amp;&nbsp;&euro;";
      assert.same(div.firstChild.textContent, '<"">\'&\xa0\u20ac');
      assert.same(div.innerHTML, '&lt;""&gt;\'&amp;&nbsp;\u20ac');
    },
  });
});
