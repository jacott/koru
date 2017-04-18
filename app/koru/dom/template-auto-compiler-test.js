isClient && define(function(require, exports, module) {
  const testTpl = require('koru/html!./template-compiler-test');
  const TH      = require('koru/test');
  const Dom     = require('./dom-client');

  var test, v;
  const $ = Dom.current;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
      Dom.removeChildren(document.body);
      delete Dom.Test;
    },

    "test rendering html template"() {
      refute(Dom.Test);

      Dom.newTemplate(testTpl);
      assert(Dom.Test.Foo);

      Dom.Test.Foo.$helpers({
        classes() {
          return 'e1 e2';
        },

        attrs() {
          $.element.setAttribute('data-x', 'x123');
        },

        dotted(arg) {
          $.element.setAttribute('data-dotted', arg);
        },
      });

      Dom.Test.Foo.Bar.$helpers({
        korulet() {
          return 'barId';
        }
      });

      const elm = Dom.Test.Foo.$autoRender({
        helperName(opts) {return opts.foo+'Adam'},
        arg: {has: {parts: 'success'}}});

      document.body.appendChild(elm);

      assert.dom('div#Foo', function () {
        assert.same(this.className, 'e1 e2');
        assert.dom('span#barId', 'a\nb\nc\nAdam');
        assert.same(this.getAttribute('data-x'), 'x123');
        assert.same(this.getAttribute('data-dotted'), 'success');
      });
    },
  });
});
