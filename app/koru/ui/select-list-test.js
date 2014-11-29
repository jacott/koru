isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var selectListTpl = require('../html!./select-list-test');
  var Dom = require('../dom');
  var SelectList = require('./select-list');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.List = Dom.newTemplate(util.deepCopy(selectListTpl));
      assert.same(Dom.Form.SelectList, SelectList);
      v.result = false;
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "defaults": {
      setUp: function () {
        SelectList.attach(v.List, {
          onChoose: function (elm, event) {
            v.currentTarget = event.currentTarget;
            v.elm = elm;
            return v.result;
          },
        });
      },

      "test select by mouse click": function () {
        renderButton();

        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          assert.dom('#TestList');
          TH.trigger(this, 'mouseup');

          assert.dom('#TestList', function () {
            assert.dom('li:first-child', function () {
              TH.click(this);
              assert.same(v.elm, this);
            });

            assert.same(v.currentTarget, this);
          });
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          refute.dom('#TestList');
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          assert.dom('#TestList');
        });
      },

      "test autoClose": function () {
        renderButton();
        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');

          v.result = true;

          TH.click('li:first-child');
          refute.dom('#TestList');
        });
      },

      "test tab closes list": function () {
        renderButton();

        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          TH.trigger(this, 'keydown', {which: 9});
        });

        refute.dom('#TestList');
      },

      "test escape closes list": function () {
        renderButton();

        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          TH.trigger(this, 'keydown', {which: 27});
        });

        refute.dom('#TestList');
      },

      "test clicking off list closes list": function () {
        renderButton();

        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
        });

        TH.trigger(document.body, 'mousedown');

        refute.dom('#TestList');
      },

      "test can't select disabled": function () {
        renderButton();

        assert.dom('#TestButton', function () {
          TH.trigger(this, 'mousedown');
          TH.trigger(this, 'mouseup');
          TH.click('li.disabled');
        });

        refute(v.currentTarget);
      },
    },

    "test selector": function () {
      SelectList.attach(v.List, {
        selector: "#TestList>ul",
        onChoose: function (elm, event) {
          v.elm = elm;
        },
      });

      document.body.appendChild(v.listElm = v.List.$autoRender({}));

      assert.dom('#TestButton', function () {
        TH.trigger(this, 'mousedown');
        TH.trigger(this, 'mouseup');
        assert.dom('#TestList', function () {
          assert.dom('ul', function () {
            TH.click(this);
            assert.same(v.elm, this);
          });
        });
      });
    },
  });

  function renderButton() {
    document.body.appendChild(v.selectElm = v.List.$autoRender({}));
  }
});
