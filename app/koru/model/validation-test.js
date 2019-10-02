define((require, exports, module)=>{
  'use strict';
  /**
   * Utilities to help validate models.
   **/
  const InclusionValidator = require('koru/model/validators/inclusion-validator');
  const RequiredValidator = require('koru/model/validators/required-validator');
  const TextValidator   = require('koru/model/validators/text-validator');
  const api             = require('koru/test/api');
  const koru            = require('../main');
  const match           = require('../match');
  const util            = require('../util');
  const Model           = require('./main');
  const TH              = require('./test-helper');

  const {error$} = require('koru/symbols');

  const {stub, spy, match: m} = TH;

  const Val   = require('./validation');

  const Module = module.constructor;

  let v = {};

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'Val'});
    });

    beforeEach(()=>{
      TH.noInfo();
      v.myModule = new Module(void 0, 'mymodule');
      v.myModule.onUnload = after;
    });

    afterEach(()=>{
      v = {};
    });

    group("Error", ()=>{
      test("msgFor", ()=>{
        const doc = {[error$]: {foo: [['too_long', 34]]}};

        assert.same(Val.Error.msgFor(doc, 'foo'), "34 characters is the maximum allowed");
      });

      test("toString", ()=>{
        const doc = {[error$]: {foo: [['too_long', 34]], bar: [['is_invalid']]}};

        assert.same(Val.Error.toString(doc), 'foo: 34 characters is the maximum allowed; '+
                    'bar: is not valid');
      });
    });

    test("addError", ()=>{
      /**
       * Add an error to an object; usually a {#../base-model;;model} document.
       **/
      api.method();
      //[
      const doc = {};
      Val.addError(doc, 'foo', 'is_too_big', 400);
      Val.addError(doc, 'foo', 'is_wrong_color', 'red');

      assert.equals(doc[error$], {foo: [['is_too_big', 400], ['is_wrong_color', 'red']]});
      //]
    });

    test("transferErrors", ()=>{
      const doc = {};
      Val.addError(doc, 'foo', 'is_too_big', 400);
      Val.addError(doc, 'foo', 'is_wrong_color', 'red');

      const doc2 = {};
      Val.transferErrors('foo', doc2, doc2);
      assert.same(doc2[error$], undefined);

      Val.transferErrors('foo', doc, doc2);
      assert.equals(doc2[error$], {foo: [['is_too_big', 400], ['is_wrong_color', 'red']]});
      Val.transferErrors('foo', doc, doc2);
      assert.equals(doc2[error$], {foo: [
        ['is_too_big', 400], ['is_wrong_color', 'red'],
        ['is_too_big', 400], ['is_wrong_color', 'red']]});
    });

    test("addSubErrors", ()=>{
      const doc = {};
      Val.addSubErrors(doc, 'foo', {
        bar: v.barErrors = [['is_too_big', 400], ['is_wrong_color', 'red']],
        fiz: [['is_invalid']]
      });

      Val.addSubErrors(doc, 'foo', {
        bar: [['is_wrong_type'], ['is_not_included', 'pink']],
        fuz: [['is_required']]
      });

      assert.equals(v.barErrors.length, 2);


      assert.equals(doc[error$], {
        'foo.bar': [['is_too_big', 400], ['is_wrong_color', 'red'],
                    ['is_wrong_type'], ['is_not_included', 'pink']],
        'foo.fiz': [['is_invalid']],
        'foo.fuz': [['is_required']],
      });
    });

    test("clearErrors", ()=>{
      Val.clearErrors();
      Val.clearErrors(null);
      Val.clearErrors(123);

      const doc = {[error$]: {}};
      Val.clearErrors(doc);

      assert.equals(doc[error$], undefined);

      const empty = {};
      Val.clearErrors(empty);
      assert.equals(Object.getOwnPropertySymbols(empty), []);
    });

    test("text", ()=>{
      assert.same(Val.text('foo'), 'foo');
      assert.same(Val.text(['foo']), 'foo');

      assert.same(Val.text('is_invalid'), 'is not valid');
      assert.same(Val.text(['unexpected_error', 'foo']), 'An unexpected error has occurred: foo');
    });

    test("check", ()=>{
      let spec = {foo: 'string'};
      refute(Val.check('dfsfd', spec));
      assert(Val.check({foo: ''}, spec));
      assert(Val.check({foo: undefined}, spec));
      assert(Val.check({foo: null}, spec));
      refute(Val.check({bar: ''}, spec));
      refute(Val.check('x', ['stirng']));

      // using match
      spec = match(function (value) {return value % 3 === 1});
      assert(Val.check(1, spec));
      refute(Val.check(2, spec));
      assert(Val.check(4, spec));

      // types
      spec = {foo: 'string', bar: {baz: 'number'}, 'as if': 'date', any: 'any', numberAry: ['number']};
      assert(Val.check(
        {foo: 'x', bar: {baz: 1}, 'as if': new Date(), numberAry: [1, 2, 3], any() {}}, spec));


      refute(Val.check({foo: 1, bar: {baz: 1}, 'as if': new Date()}, spec));
      refute(Val.check({foo: 'x', bar: {baz: 'x'}, 'as if': new Date()}, spec));
      refute(Val.check({foo: 'x', bar: {baz: 1}, 'as if': 123}, spec));

      // nested type
      spec = {foo: 'string', bar: {baz: 'string', fnord: [{abc: 'string'}]}};
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

      const data = {foo: {a: 1, b: 2, c: '3'}};
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
    });

    test("assertCheck", ()=>{
      assert.exception(()=>{
        Val.assertCheck(1, 'string');
      }, {error: 400, reason: 'is_invalid'});
      Val.assertCheck(1, 'number');
      assert.exception(()=>{
        Val.assertCheck({name: 1}, {name: 'string'});
      }, {error: 400, reason: {name: [['is_invalid']]}});
      assert.exception(()=>{
        Val.assertCheck({_id: 'abc'}, {name: 'string'});
      }, {error: 400, reason: {_id: [['is_invalid']]}});


      Val.register(v.myModule, {valAbc(doc, field) {
        this.addError(doc, field, 'is_abc');
      }});

      assert.exception(()=>{
        Val.assertCheck({name: 'abc'}, Val.matchFields({name: {type: 'string', valAbc: true}}));
      }, {error: 400, reason: {name: [['is_abc']]}});
    });

    test("assertDocChanges", ()=>{
      spy(Val, 'assertCheck');
      const existing = {changes: {name: 'new name'}, $isNewRecord() {return false}};
      Val.assertDocChanges(existing, {name: 'string'});

      assert.calledWithExactly(Val.assertCheck, existing.changes, {name: 'string'});

      const newDoc = {changes: {_id: '123', name: 'new name'}, $isNewRecord() {return true}};
      Val.assertDocChanges(newDoc, {name: 'string'});

      assert.calledWithExactly(
        Val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'id'}});

      Val.assertDocChanges(newDoc, {name: 'string'}, {_id: 'any'});

      assert.calledWithExactly(
        Val.assertCheck, newDoc.changes, {name: 'string'}, {altSpec: {_id: 'any'}});
    });


    test("validateName", ()=>{
      assert.equals(Val.validateName(), ['is_required']);
      assert.equals(Val.validateName(' ', 300), ['is_required']);
      assert.equals(Val.validateName('1234', 3), ['cant_be_greater_than', 3]);
      assert.equals(Val.validateName('   1234  ', 4), '1234');
    });

    test("allowIfSimple", ()=>{
      assert.accessDenied(()=>{Val.allowIfSimple([12, {}])});
      assert.accessDenied(()=>{Val.allowIfSimple({})});
      refute.accessDenied(()=>{Val.allowIfSimple('sdfs')});
      refute.accessDenied(()=>{Val.allowIfSimple(123)});
      refute.accessDenied(()=>{Val.allowIfSimple([], ['abc', 1234])});
    });

    test("allowIfValid", ()=>{
      assert.invalidRequest(()=>{Val.allowIfValid(false)});
      assert.exception(()=>{
        Val.allowIfValid(false, {[error$]: {x: 123}});
      }, {error: 400, reason: {x: 123}});
      refute.invalidRequest(()=>{Val.allowIfValid(true)});
      assert.exception(()=>{Val.allowIfValid(false)}, {error: 400, reason: 'is_invalid'});
      assert.exception(()=>{
        Val.allowIfValid(null, 'book');
      }, {error: 400, reason: {book: [['is_invalid']]}});
      assert.exception(()=>{
        Val.allowIfValid(false, {custom: 'message'});
      }, {error: 400, reason: {custom: 'message'}});

      assert.exception(()=>{
        Val.allowIfValid(undefined, {[error$]: {custom: 'message'}});
      }, {error: 400, reason: {custom: 'message'}});
    });

    test("allowAccessIf", ()=>{
      assert.accessDenied(()=>{Val.allowAccessIf(false);});
      refute.accessDenied(()=>{Val.allowAccessIf(true);});
    });

    test("ensureString", ()=>{
      refute.accessDenied(()=>{
        Val.ensureString("a", "b");
      });

      assert.accessDenied(()=>{
        Val.ensureString("a", 2, "b");
      });
    });

    test("ensure", ()=>{
      refute.accessDenied(()=>{
        Val.ensure(match.string, "a", "b");
        Val.ensure('func', ()=>{});
        Val.ensure(match.number, 2, 3);
      });

      assert.exception(()=>{
        Val.ensure(match.number, 2, "b");
      }, {error: 403, reason: 'Access denied - expected match.number'});
    });

    test("ensureDate", ()=>{
      refute.accessDenied(()=>{
        Val.ensureDate(new Date(), new Date(2000, 1, 1));
      });

      assert.accessDenied(()=>{
        Val.ensureDate(new Date(), 2, new Date());
      });
    });

    test("register", ()=>{
      /**
       * Register one or more collections of validators. This is conventionally done in
       * `app/models/model.js`

       * @param {object} map a collection of validation functions or a collection of collection of
       * validation functions.
       **/
      api.method();
      const module = new require.module.constructor();
      module.id = 'models/model';
      //[
      stub(module, 'onUnload');
      Val.register(module, {TextValidator, RequiredValidator});
      Val.register(module, InclusionValidator);

      assert.isFunction(Val.validators('normalize'));
      assert.isFunction(Val.validators('inclusion'));
      assert.isFunction(Val.validators('required'));

      module.onUnload.yieldAll();

      assert.same(Val.validators('normalize'), void 0);
      assert.same(Val.validators('inclusion'), void 0);
      assert.same(Val.validators('required'), void 0);
      //]
    });



    test("validators", ()=>{
      /**
       * Return a function that runs the validators with a given name. Called by BaseModel
       **/
      const module = new require.module.constructor();
      module.id = 'models/model';
      module.onUnload = after;

      const fooStub = stub();
      const barStub = {
        bar1: stub(),
        bar2: stub(),
      };

      const myunload = stub(koru, 'onunload').withArgs('mymod');

      Val.register(module, {fooStub, barStub});

      assert.same(Val.validators('fooStub'), fooStub);
      assert.same(Val.validators('bar1'), barStub.bar1);

      Val.deregister('fooStub');

      assert.same(Val.validators('fooStub'), void 0);
    });

    test("validateField", ()=>{
      let errors = 'set';
      let fieldOpts;
      Val.register(v.myModule, {addIt(doc, field, x, _fieldOpts) {
        fieldOpts = _fieldOpts;
        doc[field] += x;
        doc[error$] = errors;
      }});
      const doc = {age: 10};

      Val.validateField(doc, 'age', {type: 'number', addIt: 5});
      assert.equals(fieldOpts, {type: 'number', addIt: 5});


      assert.same(doc[error$], 'set');
      assert.same(doc.age, 15);

      doc.age = 'x';
      errors = undefined;
      Val.validateField(doc, 'age', {type: 'number', addIt: 5});

      assert.equals(doc[error$], {age: [['wrong_type', 'number']]});
      assert.same(doc.age, 'x5');
    });

    test("nestedFieldValidator", ()=>{
      const sut = Val.nestedFieldValidator(v.func = stub());

      sut.call({changes: {}}, 'foo');

      refute.msg("Should not call when field value undefined")
        .called(v.func);

      const doc = {changes: {foo: 'bar'}};

      sut.call(doc, 'foo');

      assert.calledOnceWith(v.func, doc, 'foo', 'bar', TH.match(opts => v.opts = opts));

      assert.isFunction(v.opts.onError);
      v.opts.onError();

      assert.equals(doc[error$], {foo: [['is_invalid']]});
      doc[error$] = undefined;

      v.opts.onError('abc', 'def');

      assert.equals(doc[error$], {foo: [['is_invalid', 'abc', 'def']]});

      v.opts.onError('xyz', {[error$]: {def: [['not_numeric']]}});

      assert.equals(doc[error$], {
        foo: [['is_invalid', 'abc', 'def'], ['is_invalid', 'xyz', {def: [['not_numeric']]}]]});
    });

    test("typeSpec", ()=>{
      assert.equals(
        Val.typeSpec({$fields: {foo: {type: 'a'}, bar: {type: 'b'},
                                notMe: {type: 'b', readOnly: true}}}),
        {foo: 'a', bar: 'b'});

    });

    test("matchFields", ()=>{
      Val.register(v.myModule, {divByx(doc, field, x) {
        if (doc[field] % x !== 0)
          this.addError(doc, field, 'is_invalid');
      }});

      const matcher = Val.matchFields({foo: {type: 'number', divByx: 2}});
      let doc = {foo: 4};
      assert.isTrue(matcher.test(doc));
      assert.same(doc[error$], undefined);
      doc.foo = 1;
      assert.isFalse(matcher.test(doc));
      assert.modelErrors(doc, {foo: 'is_invalid'});

      doc = {bar: 3};
      assert.isFalse(matcher.test(doc));
      assert.modelErrors(doc, {bar: 'unexpected_field'});

      assert.msg("null doc should be false").isFalse(matcher.test(null));
    });
  });
});
