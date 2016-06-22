define(function (require, exports, module) {
  var test, v;
  const NthIndex = require('./nth-index');
  const TH       = require('./test-helper');

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
    },

    tearDown () {
      v = null;
    },

    "test use" () {
      var sut = new NthIndex(2);

      assert.same(sut.add(1, 2, '12'), sut);
      sut.add(2, 2, '22');
      sut.add(2, 3, '23');



      assert.isTrue(sut.has(1));
      assert.isFalse(sut.has(3));
      assert.isFalse(sut.has(1, 3));
      assert.isTrue(sut.has(1, 2));

      assert.same(sut.get(4), undefined);
      assert.equals(sut.get(1), {2: '12'});

      assert.equals(sut.get(1, 2), '12');
      assert.equals(sut.get(1, 3), undefined);
      assert.equals(sut.get(2, 2), '22');
      assert.equals(sut.get(2, 3), '23');
      assert.equals(sut.get(3, 2), undefined);

      sut.remove(2);

      assert.same(sut.get(2), undefined);

      sut.add(2, 2,'22');
      sut.add(2, 3,'23');

      sut.remove(2, 2);
      assert.equals(sut.get(2), {3: '23'});

      sut.add(2, 3,'24');

      assert.equals(sut.get(2), {3: '24'});

      sut.remove(1, 2);

      assert.isFalse(sut.has(1));
    }
  });
});
