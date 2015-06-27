isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./plain-text');
  var Dom = require('../dom');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "fromHtml": {
      setUp: function () {
        v.c = function (html) {
          return sut.fromHtml(Dom.html(html));
        };
      },

      "test null": function () {
        assert.same(sut.fromHtml(null), '');
      },

      "test complex": function () {
        assert.same(v.c("<div><b>So <i>m</i> e</b> Text<div><br></div><div>As <i>html</i>  Test</div>" +
                        "<div>ing with<br></div><div><br></div><div> spaces</div></div>"),
                    'So m e Text\n\nAs html  Test\ning with\n\n spaces');
      },

      "test buttons": function () {
        assert.same(v.c('<div>Hello <span data-a="j2">Josiah&lt;JG&gt;</span></div>'), 'Hello Josiah<JG>');
        assert.same(v.c('<div>Hello <span data-h="s1">Foo <b>bar</b></span></div>'), 'Hello Foo bar');
      },
    },

    "test toHtml": function () {
      var elm = document.createElement('div');
      elm.appendChild(sut.toHtml("  hello world\n\nhow now\nbrown cow"));
      elm.appendChild(sut.toHtml());
      assert.same(elm.innerHTML, '  hello world<br><br>how now<br>brown cow');
    },
  });
});
