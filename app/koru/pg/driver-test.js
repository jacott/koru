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
      sut.stop();
      v = null;
    },

    "test connection": function () {
      var conn = sut.connect("/var/run/postgresql korutest");
      assert(conn);
    },

    "test defaults": function () {
      assert.equals(sut.defaults, TH.match.object);
    },

    "test defaultDb": function () {
      var db = sut.defaultDb;
      assert.same(db, sut.defaultDb);

      assert.equals(db.query('select 1 as a; select 2 as b'), [{a: 1}, {b: 2}]);
      assert.equals(db.queryOne('select 1+1 as a'), {a: 2});
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

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc"}, {_id: "456", name: "abc"}]);
      },

      "//test update": function () {
        assert.same(v.foo.update({name: 'abc'}, {$set: {name: 'def'}}), 2);
        assert.equals(v.foo.query({}), [{_id: "123", name: "def"}, {_id: "456", name: "def"}]);
      },
    },
  });
});
