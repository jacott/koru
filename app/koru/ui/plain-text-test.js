isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../ui/test-helper');
  var sut = require('./plain-text');
  var Dom = require('../dom');
  var koru = require('../main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Dom.removeChildren(document.body);
      v = null;
    },

    "test editor": function () {
      document.body.appendChild(sut.Editor.$autoRender({content: "foo", options: {placeholder: "hello"}}));
      assert.dom('.input.plainText[contenteditable=true][placeholder=hello]', function () {
        assert.same(this.textContent, "foo");
        test.spy(Dom, 'stopEvent');
        TH.trigger(this, 'keydown', {which: 66});
        TH.trigger(this, 'keydown', {which: 85});
        TH.trigger(this, 'keydown', {which: 73});
        refute.called(Dom.stopEvent);
        TH.trigger(this, 'keydown', {which: 66, ctrlKey: true});
        TH.trigger(this, 'keydown', {which: 85, ctrlKey: true});
        TH.trigger(this, 'keydown', {which: 73, ctrlKey: true});
        assert.calledThrice(Dom.stopEvent);
      });
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
