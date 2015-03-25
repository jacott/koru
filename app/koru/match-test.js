define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./match');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test match naming": function () {
      assert.same(''+sut(function (arg) {return true}), "match(function (arg) {return true})");
      assert.same(''+sut(function fooMatch(arg) {return true}), 'match(fooMatch)');
      assert.same(''+sut(function (arg) {return true}, 'my message'), 'my message');

      assert.same(''+sut.string, 'match.string');
      assert.same(''+sut.boolean, 'match.boolean');
      assert.same(''+sut.number, 'match.number');
      assert.same(''+sut.undefined, 'match.undefined');
      assert.same(''+sut.null, 'match.null');
      assert.same(''+sut.date, 'match.date');
      assert.same(''+sut.function, 'match.function');
      assert.same(''+sut.func, 'match.func');
      assert.same(''+sut.object, 'match.object');
      assert.same(''+sut.baseObject, 'match.baseObject');
      assert.same(''+sut.any, 'match.any');
      assert.same(''+sut.match, 'match.match');
    },

    "test matching": function () {
      assert.isTrue(sut.string.$test(''));
      assert.isFalse(sut.string.$test(1));

      assert.isTrue(sut.undefined.$test());
      assert.isFalse(sut.undefined.$test(''));
      assert.isFalse(sut.undefined.$test(null));

      assert.isTrue(sut.null.$test(null));
      assert.isFalse(sut.null.$test(''));
      assert.isFalse(sut.null.$test(undefined));

      assert.isTrue(sut.date.$test(new Date));
      assert.isFalse(sut.date.$test(''));
      assert.isFalse(sut.date.$test({}));

      assert.isTrue(sut.any.$test());
      assert.isTrue(sut.any.$test({}));
      assert.isTrue(sut.any.$test('hello'));

      assert.isTrue(sut.func.$test(function () {}));
      assert.isFalse(sut.func.$test({}));
      assert.isFalse(sut.func.$test('hello'));

      assert.same(sut.func.$test, sut.function.$test);

      assert.isTrue(sut.object.$test({}));
      assert.isTrue(sut.object.$test(sut.string));
      assert.isFalse(sut.object.$test(null));
      assert.isFalse(sut.object.$test(function () {}));
      assert.isTrue(sut.object.$test(new Date));
      assert.isFalse(sut.object.$test('hello'));

      assert.isTrue(sut.baseObject.$test({}));
      assert.isFalse(sut.baseObject.$test(sut.string));
      assert.isFalse(sut.baseObject.$test(null));
      assert.isFalse(sut.baseObject.$test(function () {}));
      assert.isFalse(sut.baseObject.$test(new Date));
      assert.isFalse(sut.baseObject.$test('hello'));

      assert.isTrue(sut.match.$test(sut.string));
      assert.isTrue(sut.match.$test(sut(function () {})));
      assert.isFalse(sut.match.$test(null));
      assert.isFalse(sut.match.$test({}));
    },
  });
});
