isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('bart/test');
  var sut = require('./driver');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "test collection": function () {
      var db = sut.connect("mongodb://localhost:3004/bart");
      test.onEnd(function () {
        db.collection('foo').remove({}, {multi: true});
        db.close();
      });
      assert(db);

      var foo = db.collection('foo');
      var id = foo.insert({_id: "foo123", name: 'foo name'})[0]._id;
      assert.same(id, "foo123");
    },
  });
});
