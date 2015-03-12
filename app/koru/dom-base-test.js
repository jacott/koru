define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  require('./ui/html-doc');
  var Dom = require('./dom-base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      document.body.textContent = '';
      v = null;
    },

    "test html": function () {
      document.body.appendChild(v.result = Dom.html({"class": 'bar', id: "s123", tag: 'section', span: {text: "Goodbye"}}));

      assert.same(v.result.outerHTML, '<section class="bar" id="s123"><span>Goodbye</span></section>');

      assert.same(Dom.html({html: ["hello ", {tag: 'span', text: 'cruel'}, ' world']}).outerHTML,
                  '<div>hello <span>cruel</span> world</div>');

      assert.same(Dom.html('<div id="d123" class="foo">bar</div>').outerHTML, '<div id="d123" class="foo">bar</div>');
    },

    "test escapeHTML": function () {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test classList": function () {
      var elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClass(elm, 'foo');
      assert(Dom.hasClass(elm, 'foo'));

      Dom.addClass(null, 'foo');
      Dom.addClass(elm, 'foo');
      Dom.addClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'bar'));

      Dom.removeClass(null, 'bar');
      Dom.removeClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      refute(Dom.hasClass(elm, 'bar'));

      // test toggle
      assert(Dom.toggleClass(elm, 'bar'));
      assert(Dom.hasClass(elm, 'bar'));

      refute(Dom.toggleClass(elm, 'bar'));
      refute(Dom.hasClass(elm, 'bar'));
    },
  });
});
