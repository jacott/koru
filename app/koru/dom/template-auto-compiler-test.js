isClient && define(function(require, exports, module) {
  var test, v;
  var TH = require('koru/test');
  var Dom = require('./dom-client');
  var testTpl = require('koru/html!./template-compiler-test');

  var $ = Dom.current;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      Dom.removeChildren(document.body);
      delete Dom.Test;
    },

    "test rendering html template": function () {
      refute(Dom.Test);

      Dom.newTemplate(testTpl);
      assert(Dom.Test.Foo);

      Dom.Test.Foo.$helpers({
        classes: function () {
          return 'e1 e2';
        },

        attrs: function () {
          $.element.setAttribute('data-x', 'x123');
        },

        dotted: function (arg) {
          $.element.setAttribute('data-dotted', arg);
        },
      });

      Dom.Test.Foo.Bar.$helpers({
        korulet: function () {
          return 'barId';
        }
      });

      var elm = Dom.Test.Foo.$autoRender({name: 'Adam', arg: {has: {parts: 'success'}}});

      document.body.appendChild(elm);

      assert.dom('div#Foo', function () {
        assert.same(this.className, 'e1 e2');
        assert.dom('span#barId', 'Adam');
        assert.same(this.getAttribute('data-x'), 'x123');
        assert.same(this.getAttribute('data-dotted'), 'success');
      });
    },
  });
});
