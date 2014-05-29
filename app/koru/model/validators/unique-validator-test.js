define(function (require, exports, module) {
  var test, v;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./unique-validator').bind(validation);
  var Query = require('../query');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.query = new Query({});
      v.model = {query: v.query};
      v.doc = {constructor: v.model, name: 'foo', _id: "idid", $isNewRecord: function () {
        return false;
      }};
    },

    tearDown: function () {
      v = null;
    },

    "test scope": function () {
      test.stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: 'org'});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test multi scope": function () {
      test.stub(v.query, 'count').withArgs(1).returns(1);
      v.doc.bar = 'baz';
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: ['bar', 'org']});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo', bar: 'baz', org: 'abc'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test no duplicate": function () {
      test.stub(v.query, 'count').withArgs(1).returns(0);
      sut(v.doc,'name');

      refute(v.doc._errors);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test duplicate": function () {
      test.stub(v.query, 'count').withArgs(1).returns(1);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.equals(v.query._whereNots, {_id: 'idid'});
    },

    "test new record": function () {
      v.doc.$isNewRecord = function () {
        return true;
      };
      test.stub(v.query, 'count').withArgs(1).returns(1);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);

      assert.equals(v.query._wheres, {name: 'foo'});
      assert.same(v.query._whereNots, undefined);
    },

  });
});
