isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  require('./range-select');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      document.body.appendChild(v.list = Dom.html({
        content: [0,1,2,3,4,5].map(function (i) {
          return Dom.html({textContent: "row "+i});
        })
      }));
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test toggle": function () {
      assert.dom(v.list, function () {
        assert.dom('div', 'row 2', function () {
          var selected = Dom.selectRange(this, {});
          assert.className(this, 'selected');
          var foo = Dom.selectRange(this, {}, 'foo');
          assert.className(this, 'foo');

          refute.same(selected, foo);

          assert.same(Dom.selectRange(this, {}, 'foo'), foo);

          refute.className(this, 'foo');

          // on class should not affect another
          assert.same(selected.length, 1);
          assert.same(foo.length, 0);

        });
      });
    },

    "test shift range": function () {
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

    "test control toggle": function () {
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
