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

    "test pc": function () {
      assert.same(util.pc('1.2345678'), '123.4568%');
    },

    "test px": function () {
      assert.same(util.px('123.2345678'), '123px');
    },

    "test sansPx": function () {
       assert.same(util.sansPx('123.23px'), 123.23);
       assert.same(util.sansPx(), 0);
       assert.same(util.sansPx(234), 234);
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

    "test isObjEmpty": function () {
      assert.isTrue(util.isObjEmpty({}));
      assert.isFalse(util.isObjEmpty({a: 1}));
    },

    "test addItem": function () {
      var list = ['a', 'b'];

      assert.same(util.addItem(list, 'b'), 1);
      assert.same(util.addItem(list, 'a'), 0);

      assert.equals(list, ['a', 'b']);

      assert.same(util.addItem(list, 'aa'), undefined);

      assert.equals(list, ['a', 'b', 'aa']);
    },

    "test removeItem": function () {
      var foo = [1,2,3];

      assert.same(util.removeItem(foo, 2), 2); assert.equals(foo, [1, 3]);

      assert.same(util.removeItem(foo, 4), undefined); assert.equals(foo, [1, 3]);

      util.removeItem(foo, 1); assert.equals(foo, [3]);

      util.removeItem(foo, 3); assert.equals(foo, []);

      util.removeItem(foo); assert.equals(foo, []);

      var bar = [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}];

      assert.same(util.removeItem(bar, {name: 'bar', x: 1}), undefined);
      assert.equals(bar, [{id: 4, name: "foo"}, {id: 5, name: "bar"}, {x: 1}]);


      assert.equals(util.removeItem(bar, {name: 'bar'}), {id: 5, name: "bar"});
      assert.equals(bar, [{id: 4, name: "foo"}, {x: 1}]);

      assert.equals(util.removeItem(bar, {id: 4, name: 'foo'}), {id: 4, name: 'foo'});
      assert.equals(bar, [{x: 1}]);
    },

    "test values": function () {
      assert.equals(util.values({a: 1, b: 2}), [1,2]);
    },

    'test intersectp': function () {
      assert(util.intersectp([1,4],[4,5]));
      refute(util.intersectp([1,2],['a']));
    },

    "test union": function () {
      assert.equals(util.union([1,2,3], [3, 4, 5], [3, 6]).sort(), [1, 2, 3, 4, 5, 6]);
    },

    "test diff": function () {
      assert.equals(util.diff([1,2,3], [2,4]), [1, 3]);
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

    "test egal": function () {
      assert.isTrue(util.egal(null, null));
      assert.isTrue(util.egal(NaN, NaN));
      assert.isTrue(util.egal(-0, -0));
      assert.isTrue(util.egal("str", "str"));
      assert.isTrue(util.egal(0, 0));
      assert.isTrue(util.egal(Infinity, Infinity));
      assert.isTrue(util.egal(-Infinity, -Infinity));
      assert.isTrue(util.egal(1, 1));
      assert.isTrue(util.egal(true, true));

      assert.isFalse(util.egal(true, false));
      assert.isFalse(util.egal(null, undefined));
      assert.isFalse(util.egal("", 0));
      assert.isFalse(util.egal(0, -0));
      assert.isFalse(util.egal(Infinity, -Infinity));
      assert.isFalse(util.egal(NaN, 1));
      assert.isFalse(util.egal(1, 2));
      assert.isFalse(util.egal("a", "b"));
    },

    "test deepEqual": function () {
      assert.isTrue(util.deepEqual(null, null));
      assert.isFalse(util.deepEqual(null, undefined));
      assert.isFalse(util.deepEqual(null, ""));
      assert.isTrue(util.deepEqual({}, {}));
      assert.isFalse(util.deepEqual(0, -0));
      assert.isFalse(util.deepEqual({a: 0}, {a: -0}));


      assert.isTrue(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false]}]}}));

      assert.isFalse(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [true]}]}}));
      assert.isFalse(util.deepEqual({a: 1, b: {c: -0, d: [1, {e: [false]}]}}, {a: 1, b: {c: 0, d: [1, {e: [false]}]}}));

      assert.isFalse(util.deepEqual({a: 1, b: {c: 1, d: [1, {e: [false]}]}}, {a: 1, b: {c: 1, d: [1, {e: [false], f: undefined}]}}));

      assert.isFalse(util.deepEqual({a: 1}, {a: "1"}));
    },

    "test invert": function () {
      assert.equals(util.invert({a: 1, b: 2}), {'1': "a", '2': "b"});
    },

    "test extendWithDelete": function () {
      var orig = {a: 1, b: 2, c: 3};
      var changes = {a: 2, b: undefined, d: 4};

      assert.same(util.extendWithDelete(orig, changes), orig);
      assert.equals(orig, {a:2, c: 3, d: 4});
    },

    "test lookupDottedValue": function () {
      assert.same(util.lookupDottedValue("foo.1.bar.baz", {a: 1, foo: [{}, {bar: {baz: "fnord"}}]}), "fnord");
    },

    "test applyChange with non numeric array index": function () {
      // say "foo.bar.baz" instead of "foo.0.baz"
      assert.exception(function () {
        util.applyChange({a: [{b: [1]}]}, "a.0.b.x", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");

      assert.exception(function () {
        util.applyChange({a: [{b: [1]}]}, "a.x.b.0", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");
    },

    "test applyChanges with objects": function () {
      var orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      var changes = {a: 2, b: undefined, d: 4, "nest.bar": 'bar'};

      assert.same(util.applyChanges(orig, changes), orig);
      assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'bar'}, d: 4});
      assert.equals(changes, {a: 1, b: 2, d: undefined, "nest.bar": undefined});

      var changes = {"nest.bar": 'new', "new.deep.list": 'deeplist'};
      util.applyChanges(orig, changes);

      assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'new'}, d: 4, new: {deep: {list: 'deeplist'}}});
      assert.equals(changes, {"nest.bar": 'bar', "new.deep.list": undefined});
    },

    "test applyChange deleting array entry": function () {
      var orig = {a: [1,2,3]};
      var changes = {'a.1': undefined};

      util.applyChanges(orig, changes);

      assert.equals(orig.a, [1, 3]);
    },

    "test already applied applyChanges": function () {
      var orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      var changes = {a: 1, b: 2, c: 4, nest: {foo: 'foo'}};

      util.applyChanges(orig, changes);

      assert.equals(changes, {c: 3});
    },

    "test applyChanges with empty array": function () {
      var orig = {ar: []};
      var changes = {"ar.1.foo": 3};

      util.applyChanges(orig, changes);

      assert.equals(orig, {ar: [, {foo: 3}]});
      assert.equals(changes, {"ar.1.foo": undefined});
    },

    "test applyChanges with array": function () {
      var orig = {ar: [{foo: 1}, {foo: 2}]};
      var changes = {"ar.1.foo": 3};

      util.applyChanges(orig, changes);

      assert.equals(orig, {ar: [{foo: 1}, {foo: 3}]});
      assert.equals(changes, {"ar.1.foo": 2});
    },

    "test addItem applyChanges": function () {
      var orig = {a: ["x"]};
      var changes = {"a.$+1": "a", "a.$+2": "b"};

      util.applyChanges(orig, changes);

      assert.equals(orig, {a: ["x", "a", "b"]});
      assert.equals(changes, {"a.$-1": "a", "a.$-2": "b"});
    },

    "test removeItem applyChanges": function () {
      var orig = {a: ["x", "a", "b"]};
      var changes = {"a.$-1": "a", "a.$-2": "b"};

      util.applyChanges(orig, changes);

      assert.equals(orig, {a: ["x"]});
      assert.equals(changes, {"a.$+1": "a", "a.$+2": "b"});
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

    "test pick": function () {
      assert.equals(util.pick(), {});
      assert.equals(util.pick({a: 1, b: 2, c: 3}, 'a', 'c'), {a:1, c: 3});
    },

    "test toMap": function () {
      assert.equals(util.toMap(), {});
      assert.equals(util.toMap(null), {});
      assert.equals(util.toMap(['a', 'b']), {a: true, b: true});
      assert.equals(util.toMap('foo', true, [{foo: 'a'}, {foo: 'b'}]), {a: true, b: true});
      assert.equals(util.toMap('foo', null, [{foo: 'a'}, {foo: 'b'}]), {a: {foo: 'a'}, b: {foo: 'b'}});
      assert.equals(util.toMap('foo', null, [{foo: 'a'}], [{foo: 'b'}]), {a: {foo: 'a'}, b: {foo: 'b'}});
      assert.equals(util.toMap('foo', 'baz', [{foo: 'a', baz: 1}, {foo: 'b', baz: 2}]), {a: 1, b: 2});
    },

    "test mapField": function () {
      assert.same(util.mapField(null), null);

      assert.equals(util.mapField([]), []);
      assert.equals(util.mapField([{_id: 1}, {_id: 2}]), [1, 2]);
      assert.equals(util.mapField([{foo: 2, bar: 4}, {foo: "ab"}], 'foo'), [2, "ab"]);
    },

    "test findBy": function () {
      var list = [{foo: 'a', _id: 2}, {foo: 'b', _id: 1}];
      assert.same(util.findBy(list, 1), list[1]);
      assert.same(util.findBy(list, 2), list[0]);
      assert.same(util.findBy(list, 'a', 'foo'), list[0]);
      assert.same(util.findBy(list, 'b', 'foo'), list[1]);
    },

    "test indexOf ": function () {
      var data = [{_id: 1, age: 20}, {_id: 2, age: 30}];

      // default field (_id)
      assert.same(util.indexOf(data, 1), 0);
      assert.same(util.indexOf(data, 2), 1);
      assert.same(util.indexOf(data, 3), -1);

      // explicit field (age)
      assert.same(util.indexOf(data, 30, 'age'), 1);
      assert.same(util.indexOf(data, 20, 'age'), 0);
      assert.same(util.indexOf(data, 3, 'age'), -1);
    },

    "test shallowCopy": function () {
      assert.same(util.shallowCopy(1), 1);
      assert.same(util.shallowCopy(true), true);
      assert.same(util.shallowCopy(null), null);
      assert.same(util.shallowCopy(undefined), undefined);
      assert.same(util.shallowCopy("a"), "a");

      function func() {}
      assert.same(util.shallowCopy(func), func);

      var orig = new Date(123);
      assert.equals(util.shallowCopy(orig), orig);
      refute.same(util.shallowCopy(orig), orig);


      var orig = [1, "2", {three: [4, {five: 6}]}];

      var result = util.shallowCopy(orig);

      assert.equals(orig, result);

      result[2].three = 'changed';

      assert.equals(orig, [1, "2", {three: 'changed'}]);
    },

    "test deepCopy": function () {
      assert.same(util.deepCopy(1), 1);
      assert.same(util.deepCopy(true), true);
      assert.same(util.deepCopy(null), null);
      assert.same(util.deepCopy(undefined), undefined);
      assert.same(util.deepCopy("a"), "a");

      var u8 = new Uint8Array([1, 2, 3]);
      var u8c = util.deepCopy(u8);
      refute.same(u8, u8c);
      assert.same(u8c.byteLength, 3);

      assert.same(u8c[0], 1);
      assert.same(u8c[1], 2);
      assert.same(u8c[2], 3);


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

    "test niceFilename": function () {
      assert.same(util.niceFilename("a1!@#$%/sdffsdDDfdsf/fds.txt"), 'a1-sdffsdddfdsf-fds-txt');
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

    "test hashToCss": function () {
      assert.same(util.hashToCss({foo: 1, bar: "two"}), "foo:1;bar:two");

    },

    "test compareByName": function () {
      var a = {name: "Bob"};
      var b = {name: "Bob"};

      assert.same(util.compareByName(a,b), 0);

      b.name = 'Cary';
      assert.same(util.compareByName(a,b), -1);

      b.name = 'Arnold';
      assert.same(util.compareByName(a,b), 1);

      assert.same(util.compareByName(null, b), -1);
      assert.same(util.compareByName(b, null), 1);
      assert.same(util.compareByName(undefined, null), 0);

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


      assert.same(util.compareByField('f2')(null,a), -1);
      assert.same(util.compareByField('f2')(a, null), 1);
      assert.same(util.compareByField('f2')(null, undefined), -1);

      b.f2 = "2"; // string less than number
      assert.same(util.compareByField('f2')(a,b), 1);
      assert.same(util.compareByField('f2')(b,a), -1);

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

    "test emailAddress": function () {
      assert.same(util.emailAddress('a@xyz.co', 'f<o>o <b<a>r>'), 'foo bar <a@xyz.co>');
    },

    "test parseEmailAddresses": function () {
      assert.isNull(util.parseEmailAddresses("foo@bar baz"));
      assert.isNull(util.parseEmailAddresses("foo@ba_r.com"));


      assert.equals(util.parseEmailAddresses("foo@bar.baz.com fnord"),
                    {addresses: ["foo@bar.baz.com"], remainder: "fnord"});

      assert.equals(util.parseEmailAddresses("a b c <abc@def.com> foo-_+%bar@obeya-test.co, "),
                    {addresses: ["a b c <abc@def.com>", "foo-_+%bar@obeya-test.co"], remainder: "" });
    },

    "test TwoIndex": function () {
      var sut = new util.TwoIndex();

      assert.same(sut.add(1, 2, '12'), '12');
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
    },
  });
});
