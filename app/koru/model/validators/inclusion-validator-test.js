define(function (require, exports, module) {
  const geddon     = require('../../test');
  const validation = require('../validation');

  const sut = require('./inclusion-validator').bind(validation);

  geddon.testCase(module, {
    "test allow null"() {
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

    "test matches"() {
      var doc = {state: 'open'};
      sut(doc,'state', {matches: /^ope/});
      refute(doc._errors);

      sut(doc,'state', {matches: /^ope$/});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['invalid_format']]);
    },

    "test in list"() {
      var doc = {state: 'open'};
      sut(doc,'state', {in: ['open', 'closed']});
      refute(doc._errors);

      sut(doc,'state', {in: ['OPEN', 'closed']});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['not_in_list']]);
    },

    "test in set"() {
      var doc = {state: 'open'};
      sut(doc,'state', {in: {open: '', closed: 'anything'}});
      refute(doc._errors);

      sut(doc,'state', {in: {o: 1, closed: 1}});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['not_in_list']]);

      doc = {state: 123};
      sut(doc,'state', {in: {123: 1, closed: 1}});
      assert(doc._errors);
      assert.equals(doc._errors['state'],[['not_in_list']]);
    },
  });
});
