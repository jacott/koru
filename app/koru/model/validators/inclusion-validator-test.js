define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');
  const validation      = require('../validation');

  const {error$} = require('koru/symbols');

  const sut = require('./inclusion-validator').inclusion.bind(validation);

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("allow null", ()=>{
      let doc = {state: null};
      sut(doc,'state', {allowBlank: true, matches: /foo/});
      refute(doc[error$]);

      sut(doc,'state', {matches: /^foo$/});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['invalid_format']]);


      doc = {state: ''};
      sut(doc,'state', {allowBlank: true, matches: /foo/});
      refute(doc[error$]);

      sut(doc,'state', {allowBlank: null, matches: /foo/});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['invalid_format']]);
    });

    test("matches", ()=>{
      const doc = {state: 'open'};
      sut(doc,'state', {matches: /^ope/});
      refute(doc[error$]);

      sut(doc,'state', {matches: /^ope$/});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['invalid_format']]);
    });

    test("in list", ()=>{
      const doc = {state: 'open'};
      sut(doc,'state', {in: ['open', 'closed']});
      refute(doc[error$]);

      sut(doc,'state', {in: ['OPEN', 'closed']});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['not_in_list']]);
    });

    test("in set", ()=>{
      let doc = {state: 'open'};
      sut(doc,'state', {in: {open: '', closed: 'anything'}});
      refute(doc[error$]);

      sut(doc,'state', {in: {o: 1, closed: 1}});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['not_in_list']]);

      doc = {state: 123};
      sut(doc,'state', {in: {123: 1, closed: 1}});
      assert(doc[error$]);
      assert.equals(doc[error$]['state'],[['not_in_list']]);
    });
  });
});
