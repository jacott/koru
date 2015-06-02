isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./driver');
  var util = require('../util');
  var mf = TH.match.field;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      sut.defaultDb.dropTable("Foo");
      v = null;
    },

    "test connection": function () {
      var db = sut.connect("host=/var/run/postgresql dbname=korutest");
      assert.equals(db.query('select 1 as a'), [{a: 1}]);
    },

    "test defaultDb": function () {
      var db = sut.defaultDb;
      assert.same(db, sut.defaultDb);

      db.query('CREATE TABLE "Foo" (_id varchar(17) PRIMARY KEY, "foo" jsonb)');
      db.query('INSERT INTO "Foo" ("_id","foo") values ($1,$2)', ['123', JSON.stringify({a: 1})]);
      db.query('INSERT INTO "Foo" ("_id","foo") values ($1,$2)', ['456', JSON.stringify([1])]);
      db.query('BEGIN;declare xc1 cursor for select * from "Foo"');
      db.query('COMMIT');

      assert.same(db.query('SELECT EXISTS(SELECT 1 FROM "Foo" WHERE "_id">$1)', [''])[0].exists, true);
      assert.equals(db.query('select 1+1 as a')[0], {a: 2});
      assert.equals(db.query('select 1 as a; select 2 as b'), [{a: 1}, {b: 2}]);
    },

    "test Array insert": function () {
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

    "find": {
      setUp: function () {
        v.foo = sut.defaultDb.table('Foo', {
          name: 'text',
          createdAt: 'timestamp',
          version: 'integer',
          age: {type: 'number', default: 10}
        });

        v.foo.transaction(function () {
          "one two three four five".split(' ').forEach(function (name, i) {
            v.foo.insert({_id: name+i, name: name, createdAt: new Date(util.dateNow()-i*1e6)});
          });
        });
      },

      "test fields": function () {
        assert.equals(v.foo.findOne({_id: 'one0'},{name: true}), {_id: 'one0', name: 'one'});
        assert.equals(v.foo.findOne({_id: 'one0'},{version: false, age: false}), {
          _id: 'one0', name: 'one', createdAt: TH.match.date});
        v.foo.transaction(function () {
          assert.equals(v.foo.find({_id: 'one0'},{fields: {name: true, age: true}}).next(), {
            _id: 'one0', name: 'one', age: 10});
          assert.exception(function () {
            v.foo.find({}, {fields: {age: true, name: false}});
          }, 'Error', "fields must be all true or all false");
        });
      },

      "test cursor next": function () {
        var cursor = v.foo.find({age: 10});

        assert(cursor);
        try {
          assert.equals(cursor.next(), mf('name', 'one'));
          assert.equals(cursor.next(2), [mf('name', 'two'), mf('name', 'three')]);
          assert.same(cursor.next(3).length, 2);
          assert.same(cursor.next(), undefined);
        }
        finally {
          cursor.close();
        }

        v.foo.transaction(function () {
          var cursor = v.foo.find({name: 'one'});
          assert.equals(cursor.next(1), [mf('_id', 'one0')]);
          assert.equals(cursor.next(1), []);
          cursor.close(); // optional since in transaction
        });
      },
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

      "test ensureIndex": function () {
        v.foo.ensureIndex({name: -1}, {unique: true});

        v.foo.insert({_id: '1', name: "Foo"});
        assert.exception(function () {
          v.foo.insert({_id: '2', name: "Foo"});
        }, {sqlState: '23505'});

        v.foo.ensureIndex({name: -1}, {unique: true});
      },

      "test query all": function () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc", age: 10}, {_id: "456", name: "def", age: 10}]);
      },

      "test can't add field": function () {
        assert.exception(function () {
          v.foo.update({name: 'abc'}, {$set: {foo: 'eee'}});
        }, {sqlState: '42703'});
      },

      "test transaction rollback": function () {
        try {
          v.foo.transaction(function () {
            v.foo.update({_id: '123'}, {$set: {name: 'eee'}});
            assert.equals(v.foo.findOne({_id: '123'}).name, 'eee');
            throw 'abort';
          });
        } catch(ex) {
          if (ex !== 'abort') throw ex;
        }
        assert.equals(v.foo.findOne({_id: '123'}).name, 'abc');

        // ensure transaction commit works

        v.foo.transaction(function () {
          v.foo.update({_id: '123'}, {$set: {name: 'fff'}});
        });
        assert.equals(v.foo.findOne({_id: '123'}).name, 'fff');
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

      "test count": function () {
        assert.same(v.foo.count({name: 'abc'}), 2);
      },

      "test exists": function () {
        assert.isTrue(v.foo.exists({name: 'abc'}));
        assert.isFalse(v.foo.exists({name: 'abcx'}));
      },

      "test remove": function () {
        assert.same(v.foo.remove({_id: '123'}), 1);


        assert.equals(v.foo.query({}), [{_id: "456", name: "abc"}]);

        v.foo.remove({});

        assert.equals(v.foo.query({}), []);
      },
    },
  });
});
