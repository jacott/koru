define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/model/test-db-helper');

  const {stub, spy, util} = TH;

  const Enum = require('./enum');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('calling', () => {
      const MyEnum = Enum(['one', 'two', 'three:6', 'fortyFour']);
      assert.same(MyEnum[0], 'one');
      assert.same(MyEnum[1], 'two');
      assert.same(MyEnum[6], 'three');
      assert.same(MyEnum[7], 'fortyFour');
      assert.same(MyEnum.one, 0);
      assert.same(MyEnum.two, 1);
      assert.same(MyEnum.three, 6);
      assert.same(MyEnum.fortyFour, 7);
      assert.same(MyEnum.MIN, 0);
      assert.same(MyEnum.MAX, 7);

      assert.equals(Enum.asList(MyEnum), 'one two three fortyFour'.split(' '));
      assert.equals(Enum.asMenuList(MyEnum, (n) => util.capitalize(n)), [
        {_id: 0, name: 'One'},
        {_id: 1, name: 'Two'},
        {_id: 6, name: 'Three'},
        {_id: 7, name: 'FortyFour'},
      ]);

      assert.equals(Enum.asSortedMenuList(MyEnum), [
        {_id: 7, name: 'Forty Four'},
        {_id: 0, name: 'One'},
        {_id: 6, name: 'Three'},
        {_id: 1, name: 'Two'},
      ]);
    });

    test('extend', () => {
      const BaseEnum = Enum(['zero', 'one']);
      const ExtEnum = Enum.extend(BaseEnum, ['n2:-2', 'n1']);
      assert.same(ExtEnum.one, 1);
      assert.same(ExtEnum.n2, -2);
    });

    test('match', () => {
      const MyEnum = Enum(['one', 'two:20', 'three']);
      const matcher = Enum.match(MyEnum);

      assert.isFalse(matcher.test(2));
      assert.isFalse(matcher.test(22));
      assert.isFalse(matcher.test(-1));
      assert.isFalse(matcher.test('0'));
      assert.isTrue(matcher.test(20));
      assert.isTrue(matcher.test(21));
    });
  });
});
