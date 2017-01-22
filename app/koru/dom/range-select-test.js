isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test-helper');
  require('./range-select');
  var Dom = require('./dom-client');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      document.body.appendChild(v.list = Dom.h({
        div: [0,1,2,3,4,5].map(i => Dom.h({div: "row "+i}))
      }));
    },

    tearDown() {
      Dom.removeChildren(document.body);
      v = null;
    },

    "test toggle"() {
      assert.dom(v.list, self => {
        assert.dom('div', 'row 2', self => {
          var selected = Dom.selectRange(self, {});
          assert.className(self, 'selected');
          var foo = Dom.selectRange(self, {}, 'foo');
          assert.className(self, 'foo');

          refute.same(selected, foo);

          assert.same(Dom.selectRange(self, {}, 'foo'), foo);

          refute.className(self, 'foo');

          // on class should not affect another
          assert.same(selected.length, 1);
          assert.same(foo.length, 0);

        });
      });
    },

    "test shift range"() {
      assert.dom(v.list, function () {
        assert.dom('div', 'row 2', function () {
          Dom.selectRange(this, {});
        });

        assert.dom('div', 'row 4', function () {
          Dom.selectRange(this, {shiftKey: true});
          assert.className(this, 'selected');
        });

        assert.dom('div.selected', {count: 3});
      });
    },

    "test control toggle"() {
      assert.dom(v.list, function () {
        assert.dom('div', 'row 2', function () {
          Dom.selectRange(this, {ctrlKey: true});
        });

        assert.dom('div', 'row 4', function () {
          v.selected = Dom.selectRange(this, {shiftKey: true});
        });

        assert.dom('div', 'row 3', function () {
          assert.className(this, 'selected');
          Dom.selectRange(this, {ctrlKey: true});
          assert.same(v.selected.length, 2);

          Dom.selectRange(this);
          assert.same(v.selected.length, 1);
          assert.same(v.selected[0], this);
        });

        assert.dom('div.selected', {count: 1});
      });
    },
  });
});
