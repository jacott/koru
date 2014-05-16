define(function (require, exports, module) {
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./length-validator');

  geddon.testCase(module, {
    setUp: function () {
    },

    tearDown: function () {
    },

    'test too long': function () {
      var doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 2);

      assert(doc._errors);
      assert.equals(doc._errors['name'],[["too_long", 2]]);
    },

    'test missing': function () {
      var doc = {name: ''};
      sut.maxLength.call(validation, doc,'name', 2);

      refute(doc._errors);
    },

    'test not too long': function () {
      var doc = {name: '123'};
      sut.maxLength.call(validation, doc,'name', 3);

      refute(doc._errors);
    },
  });
});
