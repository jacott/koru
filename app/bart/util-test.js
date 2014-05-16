define(['module', 'bart/test', './util'], function (module, geddon, util) {
  var test, v;
  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
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

    "test regexEscape": function () {
      assert.same(util.regexEscape('ab[12]\\w.*?\\b()'), 'ab\\[12\\]\\\\w\\.\\*\\?\\\\b\\(\\)');
    },

    "test newEscRegex": function () {
      assert.match('ab[12]\\w.*?\\b()', util.newEscRegex('ab[12]\\w.*?\\b()'));
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
          assert.equals(util.thread, {dates: [undefined, 1370819436855], date: 1370819436978});
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
