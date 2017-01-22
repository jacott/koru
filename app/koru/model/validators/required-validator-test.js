define(function (require, exports, module) {
  var test, doc;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./required-validator').bind(validation);

  geddon.testCase(module, {
    setUp() {
      doc = {exists: 'a', empty: ''};
    },

    tearDown() {
      doc = null;
    },

    "test 1"() {
      doc = {};
      sut(doc,'foo', 1);
      assert(doc._errors);
      assert.equals(doc._errors['foo'],[['is_required']]);

      doc = {foo: []};
      sut(doc,'foo', 1);
      assert(doc._errors);
      assert.equals(doc._errors['foo'],[['is_required']]);

      doc = {foo: ['baz']};
      sut(doc,'foo', 1);
      refute(doc._errors);

      doc = {foo: ['baz', 'bar']};
      sut(doc,'foo', 1);
      refute(doc._errors);
    },

    "test required false"() {
      sut(doc, 'empty', false);
      refute(doc._errors);
    },

    'test false with not_null'() {
      doc = {foo: false};
      sut(doc,'foo', 'not_null');
      refute(doc._errors);
    },

    'test missing'() {
      sut(doc,'name');

      assert(doc._errors);
      assert.equals(doc._errors['name'],[['is_required']]);
    },

    'test not_null'() {
      sut(doc,'empty','not_null');
      refute(doc._errors);

      sut(doc,'undef','not_null');
      assert(doc._errors);
    },

    'test exists'() {
      sut(doc,'exists');

      refute(doc._errors);
    },

    'test empty'() {
      sut(doc,'empty');

      assert(doc._errors);
      assert.equals(doc._errors['empty'],[['is_required']]);
    },
  });
});
