define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var val = require('./validation');
  var koru = require('../main');
  var match = require('../match');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      test.stub(koru, 'info');
    },

    tearDown: function () {
      v = null;
    },

    'test msgFor': function () {
      var doc = {_errors: {foo: [['too_long', 34]]}};

      assert.same(val.Error.msgFor(doc, 'foo'), "34 characters is the maximum allowed");
    },

    "test check": function () {
      var spec = {foo: 'string'};
      refute(val.check('dfsfd', spec));
      assert(val.check({foo: ''}, spec));
      assert(val.check({foo: undefined}, spec));
      refute(val.check({bar: ''}, spec));
      refute(val.check('x', ['stirng']));

      // using match
      var spec = match(function (value) {return value % 3 === 1});
      assert(val.check(1, spec));
      refute(val.check(2, spec));
      assert(val.check(4, spec));

      // types
      var spec = {foo: 'string', bar: {baz: 'number'}, 'as if': 'date', any: 'any', numberAry: ['number']};
      assert(val.check({foo: 'x', bar: {baz: 1}, 'as if': new Date(), numberAry: [1, 2, 3], any: function () {}}, spec));


      refute(val.check({foo: 1, bar: {baz: 1}, 'as if': new Date()}, spec));
      refute(val.check({foo: 'x', bar: {baz: 'x'}, 'as if': new Date()}, spec));
      refute(val.check({foo: 'x', bar: {baz: 1}, 'as if': 123}, spec));

      // nested type
      var spec = {foo: 'string', bar: {baz: 'string', fnord: [{abc: 'string'}]}};
      refute(val.check({foo: '', bar: {baz: 1}}, spec));
      refute(val.check({foo: '', bar: {baz: '1', fnord: [{abc: 'aa'}, {abc: 3}]}}, spec));
      assert(val.check({foo: '', bar: {baz: '1', fnord: [{abc: 'aa'}, {abc: 'bb'}]}}, spec));

      // test altSpec
      assert(val.check({foo: '', bar: 1}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      assert(val.check({foo: ''}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      assert(val.check({foo: ''}, {foo: 'string'}, {altSpec: {foo: 'number'}}));
      refute(val.check({foo: '', bar: 1, baz: ''}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      refute.msg('should not match sub field')(val.check({foo: {bar: 1}}, {foo: {sub: 'string'}},
                                                         {altSpec: {bar: 'number'}}));

      // test onError, filter and baseName

      var data = {foo: {a: 1, b: 2, c: '3'}};
      assert(val.check(data, v.spec = {foo: {a: 'number', b: 'string'}}, {
        baseName: 'x',
        onError: function (name, obj, spec, key) {
          if (key === 'c') {
            assert.same(name, 'x.foo.c');
            assert.same(obj, data.foo);
            assert.same(spec, v.spec.foo);
            delete obj[key];
            return true;
          }
        },
        filter: function (obj, key, spec, name) {
          obj[key] = 'hello there';
        },
      }));

      assert.equals(data, {foo: {a: 1, b: 'hello there'}});
    },

    "test assertCheck": function () {
      assert.exception(function () {
        val.assertCheck(1, 'string');
      }, {error: 400, reason: 'is_invalid'});
      val.assertCheck(1, 'number');
      assert.exception(function () {
        val.assertCheck({name: 1}, {name: 'string'});
      }, {error: 400, reason: {name: [['is_invalid']]}});
      assert.exception(function () {
        val.assertCheck({_id: 'abc'}, {name: 'string'});
      }, {error: 400, reason: {_id: [['is_invalid']]}});

      val.register('mymodule', {valAbc: function (doc, field) {
        this.addError(doc, field, 'is_abc');
      }});
      test.onEnd(function () {val.register('mymodule')});

      assert.exception(function () {
        val.assertCheck({name: 'abc'}, val.matchFields({name: {type: 'string', valAbc: true}}));
      }, {error: 400, reason: {name: [['is_abc']]}});
    },

    "test assertDocChanges": function () {
      test.spy(val, 'assertCheck');
      var existing = {changes: {name: 'new name'}, $isNewRecord: function () {return false}};
      val.assertDocChanges(existing, {name: 'string'});

      assert.calledWithExactly(val.assertCheck, existing.changes, {name: 'string'});

      var newDoc = {changes: {_id: '123', name: 'new name'}, $isNewRecord: function () {return true}};
      val.assertDocChanges(newDoc, {name: 'string'});

      assert.calledWithExactly(val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'string'}});

      val.assertDocChanges(newDoc, {name: 'string'}, {_id: 'any'});

      assert.calledWithExactly(val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'any'}});
    },


    "test validateName": function () {
      assert.equals(val.validateName(), ['is_required']);
      assert.equals(val.validateName(' ', 300), ['is_required']);
      assert.equals(val.validateName('1234', 3), ['cant_be_greater_than', 3]);
      assert.equals(val.validateName('   1234  ', 4), '1234');
    },

    "test allowIfSimple": function () {
      assert.accessDenied(function () {val.allowIfSimple([12, {}])});
      assert.accessDenied(function () {val.allowIfSimple({})});
      refute.accessDenied(function () {val.allowIfSimple('sdfs')});
      refute.accessDenied(function () {val.allowIfSimple(123)});
      refute.accessDenied(function () {val.allowIfSimple([], ['abc', 1234])});
    },

    "test allowAccessIf": function () {
      assert.accessDenied(function () {val.allowAccessIf(false);});
      refute.accessDenied(function () {val.allowAccessIf(true);});
    },

    "test ensureString": function () {
      refute.accessDenied(function () {
        val.ensureString("a", "b");
      });

      assert.accessDenied(function () {
        val.ensureString("a", 2, "b");
      });
    },

    "test ensure ": function () {
      refute.accessDenied(function () {
        val.ensure("string", "a", "b");
      });

      assert.accessDenied(function () {
        val.ensure("number", 2, "b");
      });
    },

    "test ensureDate": function () {
      refute.accessDenied(function () {
        val.ensureDate(new Date(), new Date(2000, 1, 1));
      });

      assert.accessDenied(function () {
        val.ensureDate(new Date(), 2, new Date());
      });
    },

    "test invalidRequest": function () {
      assert.invalidRequest(function () {val.allowIfValid(false);});
      assert.exception(function () {
        val.allowIfValid(false, 'foo');
      }, {error: 400, reason: {foo: [['is_invalid']]}});
      assert.exception(function () {
        val.allowIfValid(false, {_errors: {x: 123}});
      }, {error: 400, reason: {x: 123}});
      refute.invalidRequest(function () {val.allowIfValid(true);});
    },

    'test validators': function () {
      var fooStub = function () {
        v.val = this;
      };
      var barStub = {
        bar1: function () {v.bar1 = this},
        bar2: function () {},
      };

      var myunload = test.stub(koru, 'onunload').withArgs('mymod');

      val.register('mymod', {fooVal: fooStub, bar: barStub});

      var func = val.validators('fooVal');

      func();

      assert.same(v.val, val);

      val.deregister('fooVal');

      refute(val.validators('fooVal'));

      assert.called(myunload);

      func = val.validators('bar1');

      func();

      assert.same(v.bar1, val);

      myunload.yield();

      refute(val.validators('bar1'));
    },

    "test validateField": function () {
      val.register('mymodule', {addIt: function (doc, field, x) {
        doc[field] += x;
        doc._errors = 'set';
      }});
      test.onEnd(function () {val.register('mymodule')});
      var doc = {age: 10};

      val.validateField(doc, 'age', {type: 'number', addIt: 5});

      assert.same(doc._errors, 'set');
      assert.same(doc.age, 15);
    },

    "test matchFields": function () {
      val.register('mymodule', {divByx: function (doc, field, x) {
        if (doc[field] % x !== 0)
          this.addError(doc, field, 'is_invalid');
      }});
      test.onEnd(function () {val.register('mymodule')});

      var matcher = val.matchFields({foo: {type: 'number', divByx: 2}});
      var doc = {foo: 4};
      assert.isTrue(matcher.$test(doc));
      refute(doc.hasOwnProperty('_errors'));
      doc.foo = 1;
      assert.isFalse(matcher.$test(doc));
      assert.modelErrors(doc, {foo: 'is_invalid'});

      doc = {bar: 3};
      assert.isFalse(matcher.$test(doc));
      assert.modelErrors(doc, {bar: 'unexpected_field'});

      assert.msg("null doc should be false").isFalse(matcher.$test(null));
    },
  });
});
