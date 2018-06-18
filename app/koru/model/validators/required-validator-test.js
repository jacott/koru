define(function (require, exports, module) {
  const TH              = require('koru/test-helper');
  const validation      = require('../validation');
  const sut             = require('./required-validator').bind(validation);

  const {error$} = require('koru/symbols');

  let doc;

  TH.testCase(module, {
    setUp() {
      doc = {exists: 'a', empty: ''};
    },

    tearDown() {
      doc = null;
    },

    "test 1"() {
      doc = {};
      sut(doc,'foo', 1);
      assert(doc[error$]);
      assert.equals(doc[error$]['foo'],[['is_required']]);

      doc = {foo: []};
      sut(doc,'foo', 1);
      assert(doc[error$]);
      assert.equals(doc[error$]['foo'],[['is_required']]);

      doc = {foo: ['baz']};
      sut(doc,'foo', 1);
      refute(doc[error$]);

      doc = {foo: ['baz', 'bar']};
      sut(doc,'foo', 1);
      refute(doc[error$]);
    },

    "test required false"() {
      sut(doc, 'empty', false);
      refute(doc[error$]);
    },

    'test false with not_null'() {
      doc = {foo: false};
      sut(doc,'foo', 'not_null');
      refute(doc[error$]);
    },

    'test missing'() {
      sut(doc,'name');

      assert(doc[error$]);
      assert.equals(doc[error$]['name'],[['is_required']]);
    },

    'test not_null'() {
      sut(doc,'empty','not_null');
      refute(doc[error$]);

      sut(doc,'undef','not_null');
      assert(doc[error$]);
    },

    'test exists'() {
      sut(doc,'exists');

      refute(doc[error$]);
    },

    'test empty'() {
      sut(doc,'empty');

      assert(doc[error$]);
      assert.equals(doc[error$]['empty'],[['is_required']]);
    },
  });
});
