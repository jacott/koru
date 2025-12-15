define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/model/test-db-helper');

  const {stub, spy, util} = TH;

  const Enum = require('./enum');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('calling', () => {
      const MyEnum = Enum('one two three'.split(' '));
      assert.same(MyEnum[0], 'one');
      assert.same(MyEnum[1], 'two');
      assert.same(MyEnum[2], 'three');
      assert.same(MyEnum.one, 0);
      assert.same(MyEnum.two, 1);
      assert.same(MyEnum.three, 2);
      assert.same(MyEnum.MIN, 0);
      assert.same(MyEnum.MAX, 2);

      assert.equals(Enum.asList(MyEnum), 'one two three'.split(' '));
      assert.equals(Enum.asMenuList(MyEnum, (n) => util.capitalize(n)), [
        {_id: 0, name: 'One'},
        {_id: 1, name: 'Two'},
        {_id: 2, name: 'Three'},
      ]);
    });
  });
});
