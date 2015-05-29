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

    "Static table": {
      setUp: function () {
        v.foo = sut.defaultDb.table('Foo', {
          name: 'text',
          age: {type: 'number', default: 10}
        });

        v.foo.insert({_id: "123", name: 'abc'});
        v.foo.insert({_id: "456", name: 'def'});
      },

      tearDown: function () {
        sut.defaultDb.dropTable('Foo');
      },

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc", age: 10}, {_id: "456", name: "def", age: 10}]);
      },

      "test can't add field": function () {
        assert.exception(function () {
          v.foo.update({name: 'abc'}, {$set: {foo: 'eee'}});
        }, {code: '42703'});
      },

      "test update schema": function () {
        v.foo.schema = {
          name: 'text',
          age: {type: 'number', default: 10},
          createdAt: 'timestamp',
        };
        v.foo.update({name: 'abc'}, {$set: {name: 'eee'}});
        assert.equals(v.foo.query({name: 'eee'}), [{_id: "123", name: "eee", age: 10, createdAt: null}]);
        v.foo.update({_id: '123'}, {$set: {createdAt: v.createdAt = new Date()}});
        assert.equals(v.foo.queryOne({_id: "123"}).createdAt, v.createdAt);
      },
    },

    "Dynamic table": {
      setUp: function () {
        v.foo = sut.defaultDb.table('Foo');

        v.foo.insert({_id: "123", name: 'abc'});
        v.foo.insert({_id: "456", name: 'abc'});
      },

      tearDown: function () {
        sut.defaultDb.dropTable('Foo');
      },

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc"}, {_id: "456", name: "abc"}]);
      },

      "test update": function () {
        v.foo.update({name: 'abc'}, {$set: {name: 'def'}});
        assert.equals(v.foo.query({name: 'def'}), [{_id: "123", name: "def"}, {_id: "456", name: "def"}]);
        v.foo.update({_id: '123'}, {$set: {name: 'zzz', age: 7}});
        assert.equals(v.foo.query({_id: "123"}), [{_id: "123", name: "zzz", age: 7}]);
        assert.equals(v.foo.queryOne({_id: "123"}), {_id: "123", name: "zzz", age: 7});
        assert.equals(v.foo.queryOne({_id: "456"}), {_id: "456", name: "def", age: null});
      },
    },
  });
});
