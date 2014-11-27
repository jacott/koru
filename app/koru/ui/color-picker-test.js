isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./color-picker');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test input no alpha": function () {
      sut.choose('#ff113387', v.cb = test.stub());

      assert.dom('#ColorPicker.Dialog.Confirm>.dialogContainer>.ui-dialog', function () {
        assert.dom('input', {value: 'ff1133'});
        TH.input('input', '11223344');
        TH.click('[name=apply]');
      });

      assert.calledOnceWith(v.cb, '#112233');
    },

    "test input alpha": function () {
      sut.choose('#ff113387', 'alpha', v.cb = test.stub());

      assert.dom('#ColorPicker', function () {
        assert.dom('input', {value: 'ff113387'});
        TH.input('input', '11223344');
        TH.click('[name=apply]');
      });

      assert.calledOnceWith(v.cb, '#11223344');
    },

    "test invalid color": function () {
      sut.choose(null, v.cb = test.stub());

      assert.dom('#ColorPicker', function () {
        assert.dom('[name=apply]:not([disabled]');
        assert.dom('input', {value: 'ffffff'});
        TH.input('input', 'junk');
        assert.dom('[name=apply][disabled]');
        TH.input('input', '112233');
        assert.dom('[name=apply]:not([disabled])');
      });
    },
  });
});
