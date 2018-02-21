define(function (require, exports, module) {
  const Core            = require('../../test');
  const validation      = require('../validation');
  const sut             = require('./length-validator');

  Core.testCase(module, {
    setUp() {
    },

    tearDown() {
    },

    'test too long'() {
      var doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 2);

      assert(doc._errors);
      assert.equals(doc._errors['name'],[["too_long", 2]]);
    },

    'test missing'() {
      var doc = {name: ''};
      sut.maxLength.call(validation, doc,'name', 2);

      refute(doc._errors);
    },

    'test not too long'() {
      var doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 3);

      refute(doc._errors);
    },
  });
});
