define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  require('./html-doc');
  var Dom = require('./base');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      document.body.textContent = '';
      v = null;
    },

    "test Dom cssQuery": function () {
      document.body.appendChild(v.result = Dom.h({"class": 'bar', id: "s123",
                                                  section: {span: "Goodbye"}}));

      if (isClient)
        assert.same(Dom('body>.bar>span').textContent, "Goodbye");
      else
        assert("no server css query yet");
    },

    "test nodeIndex": function () {
      var node = Dom.h({div: ['one', 'two',  'three']});

      assert.same(Dom.nodeIndex(node.firstChild), 0);
      assert.same(Dom.nodeIndex(node.childNodes[1]), 1);
      assert.same(Dom.nodeIndex(node.childNodes[2]), 2);
    },

    "test html": function () {
      document.body.appendChild(v.result = Dom.h({"class": 'bar', id: "s123", section: {span: "Goodbye"}}));

      assert.sameHtml(v.result.outerHTML, '<section class="bar" id="s123"><span>Goodbye</span></section>');
    },

    "test escapeHTML": function () {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test classList": function () {
      var elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClasses(elm, ['foo', 'baz']);
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'baz'));

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
