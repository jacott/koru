define(function (require, exports, module) {
  var test, v;
  const koru  = require('../main');
  const match = require('../match');
  const util  = require('../util');
  const Model = require('./main');
  const TH    = require('./test-helper');
  const Val   = require('./validation');

  var Module = module.constructor;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      TH.noInfo();
      v.myModule = new Module(module.ctx, 'mymodule');
    },

    tearDown() {
      v = null;
    },

    'test msgFor'() {
      var doc = {_errors: {foo: [['too_long', 34]]}};

      assert.same(Val.Error.msgFor(doc, 'foo'), "34 characters is the maximum allowed");
    },

    'test msgFor'() {
      var doc = {_errors: {foo: [['too_long', 34]]}};

      assert.same(Val.Error.msgFor(doc, 'foo'), "34 characters is the maximum allowed");
    },

    'test text'() {
      assert.same(Val.text('foo'), 'foo');
      assert.same(Val.text(['foo']), 'foo');

      assert.same(Val.text('is_invalid'), 'is not valid');
      assert.same(Val.text(['unexpected_error', 'foo']), 'An unexpected error has occurred: foo');
    },

    "test check"() {
      var spec = {foo: 'string'};
      refute(Val.check('dfsfd', spec));
      assert(Val.check({foo: ''}, spec));
      assert(Val.check({foo: undefined}, spec));
      assert(Val.check({foo: null}, spec));
      refute(Val.check({bar: ''}, spec));
      refute(Val.check('x', ['stirng']));

      // using match
      var spec = match(function (value) {return value % 3 === 1});
      assert(Val.check(1, spec));
      refute(Val.check(2, spec));
      assert(Val.check(4, spec));

      // types
      var spec = {foo: 'string', bar: {baz: 'number'}, 'as if': 'date', any: 'any', numberAry: ['number']};
      assert(Val.check({foo: 'x', bar: {baz: 1}, 'as if': new Date(), numberAry: [1, 2, 3], any() {}}, spec));


      refute(Val.check({foo: 1, bar: {baz: 1}, 'as if': new Date()}, spec));
      refute(Val.check({foo: 'x', bar: {baz: 'x'}, 'as if': new Date()}, spec));
      refute(Val.check({foo: 'x', bar: {baz: 1}, 'as if': 123}, spec));

      // nested type
      var spec = {foo: 'string', bar: {baz: 'string', fnord: [{abc: 'string'}]}};
      refute(Val.check({foo: '', bar: {baz: 1}}, spec));
      refute(Val.check({foo: '', bar: {baz: '1', fnord: [{abc: 'aa'}, {abc: 3}]}}, spec));
      assert(Val.check({foo: '', bar: {baz: '1', fnord: [{abc: 'aa'}, {abc: 'bb'}]}}, spec));

      // test altSpec
      assert(Val.check({foo: '', bar: 1}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      assert(Val.check({foo: ''}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      assert(Val.check({foo: ''}, {foo: 'string'}, {altSpec: {foo: 'number'}}));
      refute(Val.check({foo: '', bar: 1, baz: ''}, {foo: 'string'}, {altSpec: {bar: 'number'}}));
      refute.msg('should not match sub field')(Val.check({foo: {bar: 1}}, {foo: {sub: 'string'}},
                                                         {altSpec: {bar: 'number'}}));

      // test onError, filter and baseName

      var data = {foo: {a: 1, b: 2, c: '3'}};
      assert(Val.check(data, v.spec = {foo: {a: 'number', b: 'string'}}, {
        baseName: 'x',
        onError(name, obj, spec, key) {
          if (key === 'c') {
            assert.same(name, 'x.foo.c');
            assert.same(obj, data.foo);
            assert.same(spec, v.spec.foo);
            delete obj[key];
            return true;
          }
        },
        filter(obj, key, spec, name) {
          obj[key] = 'hello there';
        },
      }));

      assert.equals(data, {foo: {a: 1, b: 'hello there'}});
    },

    "test assertCheck"() {
      assert.exception(function () {
        Val.assertCheck(1, 'string');
      }, {error: 400, reason: 'is_invalid'});
      Val.assertCheck(1, 'number');
      assert.exception(function () {
        Val.assertCheck({name: 1}, {name: 'string'});
      }, {error: 400, reason: {name: [['is_invalid']]}});
      assert.exception(function () {
        Val.assertCheck({_id: 'abc'}, {name: 'string'});
      }, {error: 400, reason: {_id: [['is_invalid']]}});


      Val.register(v.myModule, {valAbc(doc, field) {
        this.addError(doc, field, 'is_abc');
      }});
      test.onEnd(function () {Val.register(v.myModule)});

      assert.exception(function () {
        Val.assertCheck({name: 'abc'}, Val.matchFields({name: {type: 'string', valAbc: true}}));
      }, {error: 400, reason: {name: [['is_abc']]}});
    },

    "test assertDocChanges"() {
      test.spy(Val, 'assertCheck');
      var existing = {changes: {name: 'new name'}, $isNewRecord() {return false}};
      Val.assertDocChanges(existing, {name: 'string'});

      assert.calledWithExactly(Val.assertCheck, existing.changes, {name: 'string'});

      var newDoc = {changes: {_id: '123', name: 'new name'}, $isNewRecord() {return true}};
      Val.assertDocChanges(newDoc, {name: 'string'});

      assert.calledWithExactly(Val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'id'}});

      Val.assertDocChanges(newDoc, {name: 'string'}, {_id: 'any'});

      assert.calledWithExactly(Val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'any'}});
    },


    "test validateName"() {
      assert.equals(Val.validateName(), ['is_required']);
      assert.equals(Val.validateName(' ', 300), ['is_required']);
      assert.equals(Val.validateName('1234', 3), ['cant_be_greater_than', 3]);
      assert.equals(Val.validateName('   1234  ', 4), '1234');
    },

    "test allowIfSimple"() {
      assert.accessDenied(function () {Val.allowIfSimple([12, {}])});
      assert.accessDenied(function () {Val.allowIfSimple({})});
      refute.accessDenied(function () {Val.allowIfSimple('sdfs')});
      refute.accessDenied(function () {Val.allowIfSimple(123)});
      refute.accessDenied(function () {Val.allowIfSimple([], ['abc', 1234])});
    },

    "test allowAccessIf"() {
      assert.accessDenied(function () {Val.allowAccessIf(false);});
      refute.accessDenied(function () {Val.allowAccessIf(true);});
    },

    "test ensureString"() {
      refute.accessDenied(function () {
        Val.ensureString("a", "b");
      });

      assert.accessDenied(function () {
        Val.ensureString("a", 2, "b");
      });
    },

    "test ensure"() {
      refute.accessDenied(function () {
        Val.ensure(match.string, "a", "b");
        Val.ensure('func', function () {});
        Val.ensure(match.number, 2, 3);
      });

      assert.exception(function () {
        Val.ensure(match.number, 2, "b");
      }, {error: 403, details: 'expected match.number'});
    },

    "test ensureDate"() {
      refute.accessDenied(function () {
        Val.ensureDate(new Date(), new Date(2000, 1, 1));
      });

      assert.accessDenied(function () {
        Val.ensureDate(new Date(), 2, new Date());
      });
    },

    "test invalidRequest"() {
      assert.invalidRequest(function () {Val.allowIfValid(false);});
      assert.exception(function () {
        Val.allowIfValid(false, 'foo');
      }, {error: 400, reason: {foo: [['is_invalid']]}});
      assert.exception(function () {
        Val.allowIfValid(false, {_errors: {x: 123}});
      }, {error: 400, reason: {x: 123}});
      refute.invalidRequest(function () {Val.allowIfValid(true);});
    },

    'test validators'() {
      var fooStub = function () {
        v.Val = this;
      };
      var barStub = {
        bar1() {v.bar1 = this},
        bar2() {},
      };

      var myunload = test.stub(koru, 'onunload').withArgs('mymod');

      Val.register('mymod', {fooVal: fooStub, bar: barStub});

      var func = Val.validators('fooVal');

      func();

      assert.same(v.Val, Val);

      Val.deregister('fooVal');

      refute(Val.validators('fooVal'));

      assert.called(myunload);

      func = Val.validators('bar1');

      func();

      assert.same(v.bar1, Val);

      myunload.yield();

      refute(Val.validators('bar1'));
    },

    "test validateField"() {
      Val.register(v.myModule, {addIt(doc, field, x) {
        doc[field] += x;
        doc._errors = errors;
      }});
      test.onEnd(function () {Val.register(v.myModule)});
      var doc = {age: 10};

      var errors = 'set';
      Val.validateField(doc, 'age', {type: 'number', addIt: 5});

      assert.same(doc._errors, 'set');
      assert.same(doc.age, 15);

      doc.age = 'x';
      errors = null;
      Val.validateField(doc, 'age', {type: 'number', addIt: 5});

      assert.equals(doc._errors, {age: [['wrong_type', 'number']]});
      assert.same(doc.age, 'x5');
    },

    "test nestedFieldValidator"() {
      var sut = Val.nestedFieldValidator(v.func = test.stub());

      sut.call({changes: {}}, 'foo');

      refute.msg("Should not call when field value undefined")
        .called(v.func);

      var doc = {changes: {foo: 'bar'}};

      sut.call(doc, 'foo');

      assert.calledOnceWith(v.func, doc, 'foo', 'bar', TH.match(function (opts) {
        v.opts = opts;
        return true;
      }));

      assert.isFunction(v.opts.onError);
      v.opts.onError();

      assert.equals(doc._errors, {foo: [['is_invalid']]});
      doc._errors = null;

      v.opts.onError('abc', 'def');

      assert.equals(doc._errors, {foo: [['is_invalid', 'abc', 'def']]});

      v.opts.onError('xyz', {_errors: {def: [['not_numeric']]}});

      assert.equals(doc._errors, {foo: [['is_invalid', 'abc', 'def'], ['is_invalid', 'xyz', {def: [['not_numeric']]}]]});
    },

    "test matchFields"() {
      Val.register(v.myModule, {divByx(doc, field, x) {
        if (doc[field] % x !== 0)
          this.addError(doc, field, 'is_invalid');
      }});
      test.onEnd(function () {Val.register(v.myModule)});

      var matcher = Val.matchFields({foo: {type: 'number', divByx: 2}});
      var doc = {foo: 4};
      assert.isTrue(matcher.$test(doc));
      assert.same(doc._errors, undefined);
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
