define((require, exports, module)=>{
  'use strict';
  const Val             = require('koru/model/validation');
  const TH              = require('koru/test-helper');
  const Query           = require('../query');

  const {stub, spy} = TH;

  const {error$} = require('koru/symbols');

  const {unique} = require('koru/model/validators/unique-validator');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.query = new Query({});
      v.model = {query: v.query};
      v.doc = {constructor: v.model, name: 'foo', _id: "idid", $isNewRecord() {
        return false;
      }};
    });

    afterEach(()=>{
      v = {};
    });

    test("scope", ()=>{
      stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.org = 'abc';
      unique.call(Val, v.doc,'name', {scope: 'org'});

      assert(v.doc[error$]);
      assert.equals(v.doc[error$]['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("query scope", ()=>{
      stub(v.query, 'count').withArgs(1).returns(1);

      v.doc.org = 'abc';
      v.doc.foo = ['bar'];

      unique.call(Val, v.doc,'name', {scope: {org: 'org', fuz: {$ne: 'foo'}}});

      assert(v.doc[error$]);

      assert.equals(v.query._wheres, {name: 'foo', org: 'abc', fuz: {$ne: ['bar']}});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("function scope", ()=>{
      stub(v.query, 'count').withArgs(1).returns(1);

      v.doc.org = 'abc';
      v.doc.foo = ['bar'];

      function scopeFunc(query, doc, field, options) {
        assert.same(doc, v.doc);
        assert.equals(options, {scope: scopeFunc});

        query.where(field+'x', 123);
      }

      unique.call(Val, v.doc,'name', {scope: scopeFunc});

      assert(v.doc[error$]);

      assert.equals(v.query._wheres, {name: 'foo', namex: 123});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("multi scope", ()=>{
      stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.bar = 'baz';
      v.doc.org = 'abc';
      unique.call(Val, v.doc,'name', {scope: ['bar', 'org']});

      assert(v.doc[error$]);
      assert.equals(v.doc[error$]['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', bar: 'baz', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("no duplicate", ()=>{
      stub(v.query, 'count').withArgs(1).returns(0);
      unique.call(Val, v.doc,'name');

      refute(v.doc[error$]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("duplicate", ()=>{
      stub(v.query, 'count').withArgs(1).returns(1);
      unique.call(Val, v.doc,'name');

      assert(v.doc[error$]);
      assert.equals(v.doc[error$]['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    });

    test("new record", ()=>{
      v.doc.$isNewRecord = () => true;
      stub(v.query, 'count').withArgs(1).returns(1);
      unique.call(Val, v.doc,'name');

      assert(v.doc[error$]);
      assert.equals(v.doc[error$]['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.same(v.query._whereNots, undefined);
    });

  });
});
