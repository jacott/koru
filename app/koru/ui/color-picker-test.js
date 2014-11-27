isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./color-picker');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test hue slider": function () {
      sut.choose('#ffff0087', 'alpha', v.cb = test.stub());

      assert.dom('.colorPart.h', function () {
        assert.dom('.handle', function () {
          assert.cssNear(this, 'left', 16.7, 0.1,'%');
        });
        assert.dom('.slider', function () {
          var ctx = Dom.getMyCtx(this);
          ctx.data.callback(0.5, ctx, this);
        });
        assert.dom('input', {value: '180'});
      });
      assert.dom('.colorPart.s .slider', function () {
        assert.same(this.style.backgroundImage, 'linear-gradient(90deg, rgb(128, 128, 128) 0%, rgb(0, 255, 255) 100%)');
      });
      assert.dom('.colorPart.l .slider', function () {
        assert.same(this.style.backgroundImage, "linear-gradient(90deg, rgb(0, 0, 0) 0%, rgb(0, 255, 255) 50%, rgb(255, 255, 255) 100%)");
      });
      assert.dom('[name=hex]', {value: '00ffff87'});
      TH.click('[name=apply]');
      assert.calledOnceWith(v.cb, '#00ffff87');
    },

    "test sturation input": function () {
      sut.choose('#ffff0087', 'alpha', v.cb = test.stub());

      assert.dom('.colorPart.s', function () {
        assert.dom('input', {value: '100'});
        TH.input('input', '50');
        assert.dom('.handle', function () {
          assert.cssNear(this, 'left', 50, 0.1,'%');
        });
      });
      assert.dom('[name=hex]', {value: 'bfbf4087'});
      TH.click('[name=apply]');
      assert.calledOnceWith(v.cb, '#bfbf4087');
    },

    "hex input": {
      "test no alpha": function () {
        sut.choose('#ff113387', v.cb = test.stub());

        assert.dom('#ColorPicker:not(.alpha).Dialog.Confirm>.dialogContainer>.ui-dialog', function () {
          assert.dom('input', {value: 'ff1133'});
          TH.input('[name=hex]', '11223344');
          TH.click('[name=apply]');
        });

        assert.calledOnceWith(v.cb, '#112233');
      },

      "test alpha": function () {
        sut.choose('#ff113387', 'alpha', v.cb = test.stub());

        assert.dom('#ColorPicker.alpha', function () {
          assert.dom('[name=hex]', {value: 'ff113387'});
          TH.input('[name=hex]', '11223344');
          TH.click('[name=apply]');
        });

        assert.calledOnceWith(v.cb, '#11223344');
      },

      "test invalid color": function () {
        sut.choose(null, v.cb = test.stub());

        assert.dom('#ColorPicker', function () {
          assert.dom('[name=apply]:not([disabled]');
          assert.dom('[name=hex]', {value: 'ffffff'});
          TH.input('[name=hex]', 'junk');
          assert.dom('[name=apply][disabled]');
          TH.input('[name=hex]', '112233');
          assert.dom('[name=apply]:not([disabled])');
        });
      },
    },
  });
});
