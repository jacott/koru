define(function (require, exports, module) {
  var test, doc;
  var geddon = require('../../test');
  var validation = require('../validation');
  var sut = require('./associated-validator').method.bind(validation);

  geddon.testCase(module, {
    // setUp: function () {
    //   test = this;
    //   AppModel.Foo = {find: test.findStub = test.stub()};
    //   test.findStub.returns({count: function () {return 0}});
    // },

    // tearDown: function () {
    //   delete AppModel.Foo;
    // },

    "//test filter": function () {
      var foo_ids = ["xyz", "def", "abc"],
          doc = {foo_ids: foo_ids};
      test.findStub.withArgs({_id: {$in: ["xyz", "def", "abc"]}}, {fields: {_id: 1}}).returns({
        forEach: function (func) {
          func({_id: "abc"});
          func({_id: "xyz"});
      }});
      AppVal.validators('associated')(doc,'foo_ids', {filter: true});

      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, ["abc", "xyz"]);
    },

    "//test empty filter": function () {
      var foo_ids = ["abc", "def", "xyz"],
          doc = {foo_ids: foo_ids};
      test.findStub.withArgs({_id: {$in: ["abc", "def", "xyz"]}}, {fields: {_id: 1}}).returns({
        forEach: function (func) {
      }});
      AppVal.validators('associated')(doc,'foo_ids', {filter: true});

      refute(doc._errors);
      assert.same(doc.foo_ids, foo_ids);
      assert.equals(doc.foo_ids, []);
    },

    "//test none": function () {
      var doc = {};
      AppVal.validators('associated')(doc,'foo_ids', true);

      refute(doc._errors);
    },

    '//test not found': function () {
      var doc = {foo_ids: ["xyz"]};
      AppVal.validators('associated')(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["not_found"]]);
    },

    "//test changes only": function () {
      var doc = {foo_ids: ["xyz"], changes: {}};

      AppVal.validators('associated')(doc,'foo_ids', {changesOnly: true});

      refute(doc._errors);
    },

    "//test wrong type": function () {
      var doc = {foo_ids: "abc"};
      AppVal.validators('associated')(doc,'foo_ids', true);

      assert(doc._errors);
      assert.equals(doc._errors['foo_ids'],[["is_invalid"]]);
    },

    "//test using scoped finder": function () {
      var doc = {foo_ids: test.foo_ids = ['x', 'y']},
          fooFinder = test.stub();

      fooFinder.withArgs({_id: {$in: test.foo_ids}}).returns({count: function () {return 2;}});

      AppVal.validators('associated')(doc,'foo_ids', {finder: fooFinder});

      assert.called(fooFinder);
      refute(doc._errors);
    },

    "//test using scoped default": function () {
      var doc = {foo_ids: test.foo_ids = ['x', 'y'], fooFind: test.stub()},
          fooFinder = doc.fooFind;

      fooFinder.withArgs({_id: {$in: test.foo_ids}}).returns({count: function () {return 2;}});

      AppVal.validators('associated')(doc,'foo_ids', true);

      assert.calledOnce(fooFinder);
      assert.same(fooFinder.thisValues[0], doc);
      refute(doc._errors);
    },

    "//test overriding model name": function () {
      var bar_ids = ['x', 'y'];

      test.findStub.withArgs({_id: {$in: bar_ids}}).returns({count: function () {return 2;}});

      var doc = {bar_ids: bar_ids};

      AppVal.validators('associated')(doc,'bar_ids', {modelName: 'Foo'});

      assert.called(test.findStub);
      refute(doc._errors);

      AppVal.validators('associated')(doc,'bar_ids', 'Foo');
      assert.calledTwice(test.findStub);
    },

    '//test using model default': function () {
      var foo_ids = ['x', 'y'];

      test.findStub.withArgs({_id: {$in: foo_ids}}).returns({count: function () {return 2;}});

      var doc = {foo_ids: foo_ids};

      AppVal.validators('associated')(doc,'foo_ids', true);

      assert.called(test.findStub);
      refute(doc._errors);
    },
  });
});
