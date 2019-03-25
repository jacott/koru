isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * local-storage allows for easy stubbing on window.localStorage so
   * that real localStorage isn't changed in tests
   **/
  const TH   = require('koru/ui/test-helper');

  const {stub, spy, onEnd} = TH;

  const sut  = require('./local-storage');

  const {setItem, getItem, removeItem, clear} = sut;

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      // restore
      v.setItem = sut.setItem;
      v.getItem = sut.getItem;
      v.removeItem = sut.removeItem;
      v.clear = sut.clear;

      sut.setItem = setItem;
      sut.getItem = getItem;
      sut.removeItem = removeItem;
      sut.clear = clear;
    });

    afterEach(()=>{
      sut.clearAllOnChange();
      sut.removeItem('test-foo');
      sut.removeItem('test-bar');

      sut.setItem = v.setItem;
      sut.getItem = v.getItem;
      sut.removeItem = v.removeItem;
      sut.clear = v.clear;
      v = {};
    });

    test("setItem", ()=>{
      sut.setItem('test-foo', 5);
      assert.same(sut.getItem('test-foo'), '5');
    });

    test("clear", ()=>{
      sut.setItem('test-foo', 5);
      sut.clear();
      assert.same(sut.getItem('test-foo'), null);
    });

    test("onChange", ()=>{
      /**
       * listen for a change on a key
       **/

      // ensure works without any listeners
      sut._storageChanged({key: 'test-foo'});

      spy(window, 'addEventListener');
      const stopFoo1 = sut.onChange('test-foo', v.fooChanged1 = stub());
      const stopFoo2 = sut.onChange('test-foo', v.fooChanged2 = stub());
      assert.called(window.addEventListener, 'storage');
      sut.onChange('test-bar', v.barChanged = stub());
      assert.calledOnce(window.addEventListener);

      TH.trigger(window, 'storage', v.ev = {
        key: 'test-foo', newValue: 'nv', oldValue: 'ov', storageArea: window.localStorage});

      assert.calledWith(v.fooChanged1, TH.match(ev => ev.key === 'test-foo'));
      assert.called(v.fooChanged2);
      refute.called(v.barChanged);
    });
  });
});
