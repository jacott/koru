isClient && define([
  'module', 'bart-test', '../core', '../dom',
  'bart/html!./template-compiler-test'
], function (module, geddon, core, Dom,
             testTpl) {

  var $ = Dom.current;

  var test, v;
  geddon.testCase(module, {
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
      testTpl();
      assert(Dom.Test.Foo);

      Dom.Test.Foo.$helpers({
        classes: function () {
          return 'e1 e2';
        },

        attrs: function () {
          $.element.setAttribute('data-x', 'x123');
        },
      });

      Dom.Test.Foo.Bar.$helpers({
        bartlet: function () {
          return 'barId';
        }
      });

      var elm = Dom.Test.Foo.$autoRender({name: 'Adam'});

      document.body.appendChild(elm);

      assert.dom('div#Foo', function () {
        assert.same(this.className, 'e1 e2');
        assert.dom('span#barId', 'Adam');
      });
    },
  });
});
