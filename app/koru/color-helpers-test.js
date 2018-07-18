define((require, exports, module)=>{
  const Dom             = require('koru/dom');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./color-helpers');
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      v = {};
    });

    test("setBackgroundColor w. alpha", ()=>{
      const element = Dom.h({});
      TH.stubProperty(Dom, 'current', {value: {element}});

      Dom._helpers.setBackgroundColor.call({color: '#77ff0044'});

      const {style} = element;
      assert.colorEqual(style.backgroundColor, [119, 255, 0, 0.267], 0.1);
      assert.colorEqual(style.color, [77, 77, 77], 0.1);
      assert.equals(style.borderColor, '');

      assert.same(element.className, 'verylight');
    });

    test("setBackgroundAndBorderColor w. alpha", ()=>{
      const element = Dom.h({});
      TH.stubProperty(Dom, 'current', {value: {element}});

      Dom._helpers.setBackgroundAndBorderColor.call({}, '#77ff0044');

      const {style} = element;
      assert.colorEqual(style.backgroundColor, [119, 255, 0, 0.267], 0.1);
      assert.colorEqual(style.color, [77, 77, 77], 0.1);
      assert.colorEqual(style.borderColor, [77, 77, 77, 0.3], 0.1);

      assert.same(element.className, 'verylight');
    });

    test("setBackgroundColor no alpha", ()=>{
      const element = Dom.h({});
      TH.stubProperty(Dom, 'current', {value: {element}});

      Dom._helpers.setBackgroundColor.call({}, '#77ff0044', 'noAlpha');

      const {style} = element;
      assert.colorEqual(style.backgroundColor, [119, 255, 0, 1], 0.1);
      assert.colorEqual(style.color, [77, 77, 77], 0.1);
      assert.equals(style.borderColor, '');

      assert.same(element.className, 'verylight');
    });

    test("setBackgroundAndBorderColor no alpha", ()=>{
      const element = Dom.h({});
      TH.stubProperty(Dom, 'current', {value: {element}});

      Dom._helpers.setBackgroundAndBorderColor.call({color: '#77ff0044'}, undefined, 'noAlpha');

      const {style} = element;
      assert.colorEqual(style.backgroundColor, [119, 255, 0, 1], 0.1);
      assert.colorEqual(style.color, [77, 77, 77], 0.1);
      assert.colorEqual(style.borderColor, [77, 77, 77, 0.3], 0.1);

      assert.same(element.className, 'verylight');
    });
  });
});
