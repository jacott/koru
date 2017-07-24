define(function (require, exports, module) {
  const TH = require('./test');

  const sut = require('./changes');

  TH.testCase(module, {
    "test simple changes"() {
      const attrs = {bar: 1, foo: 2, fuz: 3, fiz: 4};
      const changes = {foo: null, fuz: undefined, fiz: 5, nit: 6};
      sut.applyOne(attrs, 'foo', changes);
      sut.applyOne(attrs, 'fuz', changes);
      sut.applyOne(attrs, 'fiz', changes);
      sut.applyOne(attrs, 'nit', changes);
      assert.equals(attrs, {bar: 1, fiz: 5, nit: 6});
      assert.equals(changes, {foo: 2, fuz: 3, fiz: 4, nit: TH.match.null});
    },

    "test with non numeric array index"() {
      // say "foo.bar.baz" instead of "foo.0.baz"
      assert.exception(() => {
        sut.applyOne({a: [{b: [1]}]}, "a.0.b.x", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");

      assert.exception(() => {
        sut.applyOne({a: [{b: [1]}]}, "a.x.b.0", {value: 2});
      }, 'Error', "Non numeric index for array: 'x'");
    },

    "test with objects"() {
      const orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      let changes = {a: 2, b: undefined, d: 4, "nest.bar": 'bar'};

      assert.same(sut.applyAll(orig, changes), orig);
      assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'bar'}, d: 4});
      assert.equals(changes, {a: 1, b: 2, d: undefined, "nest.bar": undefined});

      changes = {"nest.bar": 'new', "new.deep.list": 'deeplist'};
      sut.applyAll(orig, changes);

      assert.equals(orig, {a:2, c: 3, nest: {foo: 'foo', bar: 'new'},
                           d: 4, new: {deep: {list: 'deeplist'}}});
      assert.equals(changes, {"nest.bar": 'bar', "new.deep.list": undefined});
    },

    "test deleting array entry"() {
      const orig = {a: [1,2,3]};
      const changes = {'a.1': undefined};

      sut.applyAll(orig, changes);

      assert.equals(orig.a, [1, 3]);
    },

    "test already applied"() {
      const orig = {a: 1, b: 2, c: 3, nest: {foo: 'foo'}};
      const changes = {a: 1, b: 2, c: 4, nest: {foo: 'foo'}};

      sut.applyAll(orig, changes);

      assert.equals(changes, {c: 3});
    },

    "test with empty array"() {
      const orig = {ar: []};
      const changes = {"ar.1.foo": 3};

      sut.applyAll(orig, changes);

      assert.equals(orig, {ar: [, {foo: 3}]});
      assert.equals(changes, {"ar.1.foo": undefined});
    },

    "test change array"() {
      const orig = {ar: []};
      const changes = {"ar.0": 'new'};

      sut.applyAll(orig, changes);

      assert.equals(orig, {ar: ["new"]});
      assert.equals(changes, {"ar.0": undefined});
    },

    "test with array"() {
      const orig = {ar: [{foo: 1}, {foo: 2}]};
      const changes = {"ar.1.foo": 3};

      sut.applyAll(orig, changes);

      assert.equals(orig, {ar: [{foo: 1}, {foo: 3}]});
      assert.equals(changes, {"ar.1.foo": 2});
    },

    "test addItem applyAll"() {
      const orig = {a: ["x"]};
      const changes = {"a.$+1": "a", "a.$+2": "b"};

      sut.applyAll(orig, changes);

      assert.equals(orig, {a: ["x", "a", "b"]});
      assert.equals(changes, {"a.$-1": "a", "a.$-2": "b"});
    },

    "test addItem to undefined sublist"() {
      const orig = {};
      const changes = {"a.$+1": "x"};

      sut.applyAll(orig, changes);
      assert.equals(orig, {a: ["x"]});
    },

    "test removeItem applyAll"() {
      const orig = {a: ["x", "a", "b"]};
      const changes = {"a.$-1": "a", "a.$-2": "b"};

      sut.applyAll(orig, changes);

      assert.equals(orig, {a: ["x"]});
      assert.equals(changes, {"a.$+1": "a", "a.$+2": "b"});
    },

    "version 2": {

    },
  });
});
