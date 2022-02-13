isClient && define((require, exports, module) => {
  'use strict';
  const Eyedropper      = require('koru/ui/eyedropper');
  const util            = require('koru/util');
  const TH              = require('./test-helper');
  const Dom             = require('../dom');

  const {stub, spy, match: m} = TH;

  const sut = require('./color-picker');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      TH.domTearDown();
      v = {};
    });

    test('standard palette', () => {
      sut.choose({color: '#fffa1387', alpha: true, callback: v.cb = stub()});

      assert.dom('[data-color="ffff00"]', (elm) => {
        assert.same(elm.style.backgroundColor, 'rgb(255, 255, 0)');
        elm.focus();
        TH.click(elm);
      });
      assert.dom('[name=hex]', {value: 'ffff0087'});

      TH.click('[data-color="00ffff"]');
      assert.dom('[name=hex]', {value: '00ffff87'});
    });

    test('callback on destroy', () => {
      sut.choose({color: '#fffa1387', callback: v.cb = stub()});

      Dom.removeId('ColorPicker');

      assert.calledOnceWith(v.cb, null);
    });

    test('custom button', () => {
      sut.choose({color: '#fffa1387', alpha: true,
                  custom: ['My prompt', 'ret_val'],
                  callback: v.cb = stub()});

      TH.click('[name=custom]', 'My prompt');

      assert.calledOnceWith(v.cb, 'ret_val');
    });

    test('customFieldset', () => {
      sut.choose({color: '#fffa1387', alpha: true,
                  customFieldset: Dom.h({div: 'hello', class: 'myCustom'}),
                  callback: v.cb = stub()});

      assert.dom('.ui-dialog>.myCustom', 'hello');
    });

    test('hue slider', () => {
      sut.choose({color: '#ffff0087', alpha: true, callback: v.cb = stub()});

      assert.dom('.colorPart.h', () => {
        assert.dom('.handle', (handle) => {
          assert.cssNear(handle, 'left', 16.7, 0.1, '%');
        });
        assert.dom('.slider', (slider) => {
          const ctx = Dom.myCtx(slider);
          ctx.data.callback(0.5, ctx, slider);
        });
        assert.dom('input', {value: '180'});
      });
      assert.dom('.startTab', (tab) => {
        assert.same(document.activeElement, tab);
      });
      assert.dom('.colorPart.s .slider', (slider) => {
        assert.same(slider.style.backgroundImage,
                    'linear-gradient(90deg, rgb(128, 128, 128) 0%, rgb(0, 255, 255) 100%)');
      });
      assert.dom('.colorPart.l .slider', (slider) => {
        assert.same(slider.style.backgroundImage,
                    'linear-gradient(90deg, rgb(0, 0, 0) 0%, rgb(0, 255, 255) 50%, ' +
                    'rgb(255, 255, 255) 100%)');
      });
      assert.dom('[name=hex]', {value: '00ffff87'});
      TH.click('[name=apply]');
      assert.calledOnceWith(v.cb, '#00ffff87');
    });

    test('saturation input', () => {
      sut.choose({color: '#ffff0087', alpha: true, callback: v.cb = stub()});

      assert.dom('.colorPart.s', (part) => {
        part.focus();
        assert.dom('input', {value: '100'});
        TH.input('input', '-50');
        assert.dom('.handle', (handle) => {
          assert.cssNear(handle, 'left', 0, 0.1, '%');
        });
        TH.input('input', '150');
        assert.dom('.handle', (handle) => {
          assert.cssNear(handle, 'left', 100, 0.1, '%');
        });
        TH.input('input', '50');
        assert.dom('.handle', (handle) => {
          assert.cssNear(handle, 'left', 50, 0.1, '%');
        });
      });
      assert.dom('[name=hex]', {value: 'bfbf4087'}, (input) => {
        assert.colorEqual(input.style.backgroundColor, [191, 191, 64, 1]);
      });
      TH.click('[name=apply]');
      assert.calledOnceWith(v.cb, '#bfbf4087');
    });

    test('eyedropper', () => {
      stub(Eyedropper, 'pick');
      sut.choose({color: '#ff113387', callback: v.cb = stub()});

      assert.dom('#ColorPicker .ui-dialog', (dialog) => {
        assert.dom('[name=hex-eyedropper]', (ed) => {
          TH.click(ed);
          ed.focus();
        });

        assert.calledWith(Eyedropper.pick, m.func);

        Eyedropper.pick.yield(null, {r: 123, g: 21, b: 255, a: .3});

        assert.dom('[name=hex]', {value: '7b15ff'}, (input) => {
          assert.colorEqual(input.style.backgroundColor, [123, 21, 255, 1]);
        });
        TH.click('[name=apply]');
      });

      assert.calledOnceWith(v.cb, '#7b15ff');
    });

    group('hex input', () => {
      test('no alpha', () => {
        sut.choose({color: '#ff113387', callback: v.cb = stub()});

        assert.dom('#ColorPicker:not(.alpha).Dialog.Confirm>.dialogContainer>.ui-dialog', () => {
          assert.dom('input', {value: 'ff1133'});
          TH.input('[name=hex]', '11223344');
          TH.click('[name=apply]');
        });

        assert.calledOnceWith(v.cb, '#112233');
      });

      test('alpha', () => {
        sut.choose({color: '#ff113387', alpha: true, callback: v.cb = stub()});

        assert.dom('#ColorPicker.alpha', () => {
          assert.dom('[name=hex]', {value: 'ff113387'});
          TH.input('[name=hex]', '11223344');
          assert.dom('.sample>div', (sample) => {
            assert.colorEqual(sample.style.backgroundColor, [17, 34, 51, 0.26], 0.01);
          });
          TH.click('[name=apply]');
        });

        assert.calledOnceWith(v.cb, '#11223344');
      });

      test('invalid color', () => {
        sut.choose({callback: v.cb = stub()});

        assert.dom('#ColorPicker', () => {
          assert.dom('[name=apply]:not([disabled])');
          assert.dom('[name=hex]', {value: 'ffffff'});
          TH.input('[name=hex]', 'junk');
          assert.dom('[name=apply][disabled]');
          TH.input('[name=hex]', '112233');
          assert.dom('[name=apply]:not([disabled])');
        });
      });
    });
  });
});
