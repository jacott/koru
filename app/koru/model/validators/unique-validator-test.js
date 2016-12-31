define(function (require, exports, module) {
  const geddon     = require('../../test');
  const Query      = require('../query');
  const validation = require('../validation');

  const sut        = require('./unique-validator').bind(validation);
  var v;

  geddon.testCase(module, {
    setUp() {
      v = {};
      v.query = new Query({});
      v.model = {query: v.query};
      v.doc = {constructor: v.model, name: 'foo', _id: "idid", $isNewRecord() {
        return false;
      }};
    },

    tearDown() {
      v = null;
    },

    "test scope"() {
      this.stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: 'org'});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test query scope"() {
      this.stub(v.query, 'count').withArgs(1).returns(1);

      v.doc.org = 'abc';
      v.doc.foo = ['bar'];

      sut(v.doc,'name', {scope: {org: 'org', fuz: {$ne: 'foo'}}});

      assert(v.doc._errors);

      assert.equals(v.query._wheres, {name: 'foo', org: 'abc', fuz: {$ne: ['bar']}});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test multi scope"() {
      this.stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.bar = 'baz';
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: ['bar', 'org']});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', bar: 'baz', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test no duplicate"() {
      this.stub(v.query, 'count').withArgs(1).returns(0);
      sut(v.doc,'name');

      refute(v.doc._errors);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test duplicate"() {
      this.stub(v.query, 'count').withArgs(1).returns(1);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test new record"() {
      v.doc.$isNewRecord = function () {
        return true;
      };
      this.stub(v.query, 'count').withArgs(1).returns(1);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.same(v.query._whereNots, undefined);
    },

  });
});
