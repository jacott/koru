define(function (require, exports, module) {
  var test;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./inclusion-validator').bind(validation);

  geddon.testCase(module, {
    "test allow null": function () {
      var doc = {state: null};
      sut(doc,'state', {allowBlank: true, matches: /foo/});
      refute(doc._errors);

      sut(doc,'state', {matches: /^foo$/});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['invalid_format']]);


      var doc = {state: ''};
      sut(doc,'state', {allowBlank: true, matches: /foo/});
      refute(doc._errors);

      sut(doc,'state', {allowBlank: null, matches: /foo/});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['invalid_format']]);
    },

    "test matches": function () {
      var doc = {state: 'open'};
      sut(doc,'state', {matches: /^ope/});
      refute(doc._errors);

      sut(doc,'state', {matches: /^ope$/});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['invalid_format']]);
    },

    "test in list": function () {
      var doc = {state: 'open'};
      sut(doc,'state', {in: ['open', 'closed']});
      refute(doc._errors);

      sut(doc,'state', {in: ['OPEN', 'closed']});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['not_in_list']]);
    },
  });
});
