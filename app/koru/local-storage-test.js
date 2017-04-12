isClient && define(function (require, exports, module) {
  /**
   * local-storage allows for easy stubbing on window.localStorage so
   * that real localStorage isn't changed in tests
   **/
  const TH   = require('koru/ui/test-helper');

  const sut  = require('./local-storage');
  var v;

  const {setItem, getItem, removeItem} = sut;

  TH.testCase(module, {
    setUp() {
      v = {};
      // restore
      v.setItem = sut.setItem;
      v.getItem = sut.getItem;
      v.removeItem = sut.removeItem;

      sut.setItem = setItem;
      sut.getItem = getItem;
      sut.removeItem = removeItem;
    },

    tearDown() {
      sut.clearAllOnChange();
      sut.removeItem('test-foo');
      sut.removeItem('test-bar');

      sut.setItem = v.setItem;
      sut.getItem = v.getItem;
      sut.removeItem = v.removeItem;
      v = null;
    },

    "test setItem"() {
      sut.setItem('test-foo', 5);
      assert.same(sut.getItem('test-foo'), '5');
    },

    "test onChange"() {
      /**
       * listen for a change on a key
       **/
      this.spy(window, 'addEventListener');
      const stopFoo1 = sut.onChange('test-foo', v.fooChanged1 = this.stub());
      const stopFoo2 = sut.onChange('test-foo', v.fooChanged2 = this.stub());
      assert.called(window.addEventListener, 'storage');
      sut.onChange('test-bar', v.barChanged = this.stub());
      assert.calledOnce(window.addEventListener);

      TH.trigger(window, 'storage', v.ev = {
        key: 'test-foo', newValue: 'nv', oldValue: 'ov', storageArea: window.localStorage});

      assert.calledWith(v.fooChanged1, TH.match(ev => ev.key === 'test-foo'));
      assert.called(v.fooChanged2);
      refute.called(v.barChanged);
    },
  });
});