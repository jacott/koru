isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./driver');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "with collection": {
      setUp: function () {
        v.foo = sut.defaultDb.collection('Foo');

        v.foo.insert({_id: "123", name: 'abc'});
        v.foo.insert({_id: "456", name: 'abc'});
      },

      tearDown: function () {
        sut.defaultDb.dropCollection('Foo');
      },


      "test update": function () {
        assert.same(v.foo.update({name: 'abc'}, {$set: {name: 'def'}}, {multi: true}), 2);
      },

      "test find": function () {
        var cursor = v.foo.find({name: 'abc'});

        assert(cursor);
        try {
          assert.equals(cursor.next(), {_id: "123", name: 'abc'});
          assert.equals(cursor.next(), {_id: "456", name: 'abc'});
          assert.same(cursor.next(), null);
        }
        finally {
          cursor.close();
        }
      },

      "test findOne": function () {
        assert.equals(v.foo.findOne({_id: "123"}), {_id: "123", name: 'abc'});
      },

      "test count": function () {
        assert.same(v.foo.count({_id: "123"}), 1);
        assert.same(v.foo.count({name: "abc"}), 2);
      },
    },

    "test defaultDb": function () {
      test.onEnd(function () {
        sut.defaultDb.dropCollection('Foo');
      });

      var db = sut.defaultDb;
      assert.same(db, sut.defaultDb);

      var foo = db.collection('Foo');
      foo.insert({_id: "foo123", name: 'foo name'});

      assert.equals(foo.findOne({_id: "foo123"}), {_id: "foo123", name: 'foo name'});
    },

    "test collection": function () {
      var db = sut.connect("mongodb://localhost:3004/koru");
      test.onEnd(function () {
        db.dropCollection('foo');
        db.close();
      });
      assert(db);

      var foo = db.collection('Foo');
      var id = foo.insert({_id: "foo123", name: 'foo name'})[0]._id;
      assert.same(id, "foo123");

      assert.equals(foo.findOne({_id: "foo123"}), {_id: "foo123", name: 'foo name'});

      foo.remove({}, {multi: true});

      assert.equals(foo.findOne({_id: "foo123"}), null);
    },
  });
});
