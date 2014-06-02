define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var util = require('./util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test indexOfRegex": function () {
      var list = [{foo: 'a'}, {foo: 'b'}];
      assert.same(util.indexOfRegex(list, /a/, 'foo'), 0);
      assert.same(util.indexOfRegex(list, /ab/, 'foo'), -1);
      assert.same(util.indexOfRegex(list, /b/, 'foo'), 1);
    },

    "test isArray": function () {
      assert.isTrue(util.isArray([]));
      assert.isFalse(util.isArray({}));
      assert.isFalse(util.isArray());
      assert.isFalse(util.isArray("[1,2]"));
    },

    "test values": function () {
      assert.equals(util.values({a: 1, b: 2}), [1,2]);
    },

    'test extend': function () {
      var item = 5,
          sub={a: 1, b: 2},
          sup = {b: 3, get c() {return item;}};

      util.extend(sub,sup);

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,3);
      assert.same(sub.c,6);
    },

    "test extendWithDelete": function () {
      var orig = {a: 1, b: 2, c: 3};
      var changes = {a: 2, b: undefined, d: 4};

      assert.same(util.extendWithDelete(orig, changes), orig);
      assert.equals(orig, {a:2, c: 3, d: 4});
    },

    "test swapWithDelete": function () {
      var orig = {a: 1, b: 2, c: 3};
      var changes = {a: 2, b: undefined, d: 4};

      assert.same(util.swapWithDelete(orig, changes), orig);
      assert.equals(orig, {a:2, c: 3, d: 4});
      assert.equals(changes, {a: 1, b: 2, d: undefined});
    },

    "test extractViaKeys": function () {
      var keys = {a: 1, b: 2, c: 3};
      var attrs = {a: 2, b: undefined, d: 4};

      assert.equals(util.extractViaKeys(keys, attrs), {a: 2, b: undefined, c: undefined});
      assert.equals(keys, {a: 1, b: 2, c: 3});
      assert.equals(attrs, {a: 2, b: undefined, d: 4});
    },

    "test includesAttributes": function () {
      var changes = {b: '2'};
      var doc = {a: '1', b: '3'};

      assert.isTrue(util.includesAttributes({a: 1}, changes, doc, null));
      assert.isTrue(util.includesAttributes({a: 1, b: '2'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 1, b: '3'}, changes, doc, null));
      assert.isFalse(util.includesAttributes({a: 2, b: '2'}, changes, doc, null));
    },

    "test regexEscape": function () {
      assert.same(util.regexEscape('ab[12]\\w.*?\\b()'), 'ab\\[12\\]\\\\w\\.\\*\\?\\\\b\\(\\)');
    },

    "test newEscRegex": function () {
      assert.match('ab[12]\\w.*?\\b()', util.newEscRegex('ab[12]\\w.*?\\b()'));
    },

    "test mapField": function () {
      assert.same(util.mapField(null), null);

      assert.equals(util.mapField([]), []);
      assert.equals(util.mapField([{_id: 1}, {_id: 2}]), [1, 2]);
      assert.equals(util.mapField([{foo: 2, bar: 4}, {foo: "ab"}], 'foo'), [2, "ab"]);
    },

    "test deepCopy": function () {
      assert.same(util.deepCopy(1), 1);
      assert.same(util.deepCopy(true), true);
      assert.same(util.deepCopy(null), null);
      assert.same(util.deepCopy(undefined), undefined);
      assert.same(util.deepCopy("a"), "a");

      function func() {}
      assert.same(util.deepCopy(func), func);

      var orig = new Date(123);
      assert.equals(util.deepCopy(orig), orig);
      refute.same(util.deepCopy(orig), orig);


      var orig = [1, "2", {three: [4, {five: 6}]}];

      var result = util.deepCopy(orig);

      assert.equals(orig, result);

      result[2].three[1].five = 'changed';

      assert.equals(orig, [1, "2", {three: [4, {five: 6}]}]);
    },

    "test camelize": function () {
      assert.same(util.camelize(""), "");
      assert.same(util.camelize("abc"), "abc");
      assert.same(util.camelize("abc-def_xyz.qqq+foo%bar"), "abcDefXyzQqqFooBar");
      assert.same(util.camelize("CarlySimon"), "CarlySimon");
    },

    "test titleize": function () {
      assert.same(util.titleize(""), "");
      assert.same(util.titleize("abc"), "Abc");
      assert.same(util.titleize("abc-def_xyz.qqq+foo%bar"), "Abc Def Xyz Qqq Foo Bar");
      assert.same(util.titleize("CarlySimon"), "Carly Simon");
    },

    "test humanize": function () {
      assert.same(util.humanize('camelCaseCamel_id'), "camel case camel");
      assert.same(util.humanize('Hyphens-and_underscores'), "hyphens and underscores");

    },

    "test initials": function () {
      assert.same(util.initials(null, 2), "");
      assert.same(util.initials("Sam THE BIG Man", 2), "SM");
      assert.same(util.initials("Sam the BIG man"), "STM");
      assert.same(util.initials("Prince"), "P");
    },

    "test compareByName": function () {
      var a = {name: "Bob"};
      var b = {name: "Bob"};

      assert.same(util.compareByName(a,b), 0);

      b.name = 'Cary';
      assert.same(util.compareByName(a,b), -1);

      b.name = 'Arnold';
      assert.same(util.compareByName(a,b), 1);
    },

    "test compareByField": function () {
      var a = {f1: "Bob", f2: 1};
      var b = {f1: "Bob", f2: 2};

      assert.same(util.compareByField('f1')(a,b), 0);

      b.f1 = 'Cary';
      assert.same(util.compareByField('f1')(a,b), -1);

      b.f1 = 'Arnold';
      assert.same(util.compareByField('f1')(a,b), 1);

      assert.same(util.compareByField('f2')(a,b), -1);

      assert.same(util.compareByField('f2')(b,a), 1);
    },

    "test colorToArray": function () {
      assert.equals(util.colorToArray([1,2,3,0.5]), [1,2,3,0.5]);
      assert.equals(util.colorToArray("#ac3d4f"), [172, 61, 79, 1]);
      assert.equals(util.colorToArray("#d4faf480"), [212, 250, 244, 0.5]);

      assert.equals(util.colorToArray("rgb(212, 250,244, 0.2)"), [212, 250, 244, 0.2]);
      assert.equals(util.colorToArray("rgba(212, 150,244, 0.8)"), [212, 150, 244, 0.8]);

      assert.equals(util.colorToArray("#ac3"), [170, 204, 51, 1]);
    },

    "nestedHash": {
      "test setNestedHash": function () {
        var hash = {};

        util.setNestedHash(123, hash, 'a', 'b');
        assert.same(util.setNestedHash(456, hash, 'a', 'c'), 456);

        assert.equals(hash, {a: {b: 123, c: 456}});
      },

      "test getNestedHash": function () {
        var hash = {a: {b: 123, c: 456}};

        assert.equals(util.getNestedHash(hash, 'a', 'b'), 123);
        assert.equals(util.getNestedHash(hash, 'a'), {b: 123, c: 456});
        assert.equals(util.getNestedHash(hash, 'b'), undefined);
        assert.equals(util.getNestedHash(hash, 'a', 'd'), undefined);
      },

      "test deleteNestedHash": function () {
        var hash = {a: {b: 123, c: 456}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'b'), 123);
        assert.equals(util.deleteNestedHash(hash, 'a'), {c: 456});
        assert.equals(hash, {});

        var hash = {a: {c: {d: 456}}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'c', 'd'), 456);

        assert.equals(hash, {});

        var hash = {a: {b: 123, c: {d: 456}}};

        assert.equals(util.deleteNestedHash(hash, 'a', 'c', 'd'), 456);

        assert.equals(hash, {a: {b: 123}});
      },
    },

    'test reverseExtend': function () {
      var item = 5,
          sub={a: 1, b: 2},
          sup = {d: 'd', b: 3, get c() {return item;}};

      util.reverseExtend(sub,sup, {d: 1});

      item = 6;

      assert.same(sub.a,1);
      assert.same(sub.b,2);
      assert.same(sub.c,6);
      refute('d' in sub);
    },

    "test withDateNow": function () {
      var date = new Date("2013-06-09T23:10:36.855Z");
      var result = util.withDateNow(date, function () {
        assert.equals(util.newDate(), date);
        assert.equals(util.dateNow(), +date);
        assert.same(util.withDateNow(+date + 123, function () {
          assert.equals(util.newDate(), new Date(+date + 123));
          assert.equals(util.dateNow(), +date + 123);

          if (isServer) {
            var Fiber = requirejs('fibers');
            assert.same(util.thread, Fiber.current.appThread);
          }
          assert.equals(util.thread.dates, [undefined, 1370819436855]);
          return 987;
        }), 987);

        assert.equals(util.newDate(), date);
        assert.equals(util.dateNow(), +date);
        return true;
      });

      var before = util.dateNow();
      var now = Date.now();
      var after = util.dateNow();

      assert.between(now, before, after);

      assert.isTrue(result);
    },


  });
});
