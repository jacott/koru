define(function (require, exports, module) {
  var test, v;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./unique-validator').bind(validation);

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.model = {exists: test.stub()};
      v.doc = {constructor: v.model, name: 'foo', _id: "idid", $isNewRecord: function () {
        return false;
      }};
    },

    tearDown: function () {
      v = null;
    },

    "test scope": function () {
      v.model.exists.withArgs({$and: [{org: 'abc', _id: {$ne: "idid"}},{name: 'foo'}]}).returns(true);
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: 'org'});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);
    },

    "test multi scope": function () {
      v.model.exists.withArgs({$and: [{bar: 'baz', org: 'abc',  _id: {$ne: "idid"}},{name: 'foo'}]}).returns(true);
      v.doc.bar = 'baz';
      v.doc.org = 'abc';
      sut(v.doc,'name', {scope: ['bar', 'org']});

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);
    },

    "test no duplicate": function () {
      v.model.exists.withArgs({$and: [{_id: {$ne: "idid"}}, {name: 'foo'}]}).returns(false);
      sut(v.doc,'name');

      refute(v.doc._errors);
    },

    "test duplicate": function () {
      v.model.exists.withArgs({$and: [{_id: {$ne: "idid"}}, {name: 'foo'}]}).returns(true);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);
    },

    "test new record": function () {
      v.doc.$isNewRecord = function () {
        return true;
      };
      v.model.exists.withArgs({name: 'foo'}).returns(true);
      sut(v.doc,'name');

      assert(v.doc._errors);
      assert.equals(v.doc._errors['name'],[['not_unique']]);
    },

  });
});
