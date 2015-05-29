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
      v.foo && sut.defaultDb.dropTable('Foo');
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

      assert.equals(db.query('select 1 as a; select 2 as b').rows, [{a: 1}, {b: 2}]);
      assert.equals(db.findOne('select 1+1 as a'), {a: 2});
    },

    "test Array": function () {
      v.foo = sut.defaultDb.table('Foo', {
        bar_ids: 'has_many',
      });

      v.foo.insert({_id: '123', bar_ids: ["1","2","3"]});
      assert.equals(v.foo.findOne({}).bar_ids, ['1', '2', '3']);
    },

    "test Array in jsonb": function () {
      v.foo = sut.defaultDb.table('Foo', {
        bar_ids: 'object',
      });

      v.foo.insert({_id: '123', bar_ids: ["1",{a: v.date = new Date()}]});
      assert.equals(v.foo.findOne({}).bar_ids, ['1', {a: v.date.toISOString()}]);
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

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc", age: 10}, {_id: "456", name: "def", age: 10}]);
      },

      "test can't add field": function () {
        assert.exception(function () {
          v.foo.update({name: 'abc'}, {$set: {foo: 'eee'}});
        }, {code: '42703'});
      },

      "test transaction rollback": function () {
        try {
          v.foo.transaction(function () {
            var x = v.foo.update({_id: '123'}, {$set: {name: 'eee'}});
            assert.equals(v.foo.findOne({_id: '123'}).name, 'eee');
            throw 'abort';
          });
        } catch(ex) {
          if (ex !== 'abort') throw ex;
        }
        assert.equals(v.foo.findOne({_id: '123'}).name, 'abc');
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
        assert.equals(v.foo.findOne({_id: "123"}).createdAt, v.createdAt);
      },
    },

    "Dynamic table": {
      setUp: function () {
        v.foo = sut.defaultDb.table('Foo');

        assert.same(v.foo.insert({_id: "123", name: 'abc'}), 1);
        v.foo.insert({_id: "456", name: 'abc'});
      },

      "test transaction rollback": function () {
        try {
          v.foo.transaction(function () {
            assert.same(v.foo.update({_id: '123'}, {$set: {foo: 'eee'}}), 1);
            assert.equals(v.foo.findOne({_id: '123'}).foo, 'eee');
            throw 'abort';
          });
        } catch(ex) {
          if (ex !== 'abort') throw ex;
        }
        assert.msg('should not  have a foo column')
          .equals(v.foo.findOne({_id: '123'}), {_id: '123', name: 'abc'});
      },

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc"}, {_id: "456", name: "abc"}]);
      },

      "test update": function () {
        assert.same(v.foo.update({name: 'abc'}, {$set: {name: 'def'}}), 2);

        assert.equals(v.foo.query({name: 'def'}), [{_id: "123", name: "def"}, {_id: "456", name: "def"}]);
        assert.same(v.foo.update({_id: '123'}, {$set: {name: 'zzz', age: 7}}), 1);

        assert.equals(v.foo.query({_id: "123"}), [{_id: "123", name: "zzz", age: 7}]);
        assert.equals(v.foo.findOne({_id: "123"}), {_id: "123", name: "zzz", age: 7});
        assert.equals(v.foo.findOne({_id: "456"}), {_id: "456", name: "def", age: null});
      },

      "test remove": function () {
        assert.same(v.foo.remove({_id: '123'}), 1);


        assert.equals(v.foo.find({}), [{_id: "456", name: "abc"}]);

        v.foo.remove({});

        assert.equals(v.foo.find({}), []);
      },
    },
  });
});
