isServer && define(function (require, exports, module) {
  /**
   * Interface to PostgreSQL.
   *
   * @config url The default url to connect to; see
   * [pg-libpq](https://www.npmjs.com/package/pg-libpq), [libpq -
   * PQconnectdb](http://www.postgresql.org/docs/9.4/interactive/libpq-connect.html)
   *
   **/
  var test, v;
  const api  = require('koru/test/api');
  const TH   = require('../test');
  const util = require('../util');
  const pg  = require('./driver');

  var mf = TH.match.field;

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      api.module(null, 'pg');
    },

    tearDown () {
      pg.defaultDb.dropTable("Foo");
      v = null;
    },

    "test ::Client"() {
      function abstract() {
        /**
         * A connection to a database.
         *
         * See {#koru/pg/driver.connect}
         **/
      }
      const Client = pg.defaultDb.constructor;
      api.innerSubject(Client, null, {
        abstract,
        initExample() {
          const Client = pg.defaultDb.constructor;
        },
        initInstExample() {
          const client = pg.defaultDb;
        },
      });

      const client = new Client('host=/var/run/postgresql dbname=korutest');
      const client2 = new Client(undefined, 'my name');

      assert.same(client._url, 'host=/var/run/postgresql dbname=korutest');
      assert.same(client.name, 'public');
      assert.same(client2.name, 'my name');

      assert(client._id < client2._id );
    },

    "test jsFieldToPg"() {
      api.innerSubject(pg.defaultDb.constructor)
        .protoMethod('jsFieldToPg');

      assert.equals(pg.defaultDb.jsFieldToPg('runs', 'number'), '"runs" double precision');
      assert.equals(pg.defaultDb.jsFieldToPg('name'), '"name" text');
      assert.equals(pg.defaultDb.jsFieldToPg('dob', {type: 'date'}), '"dob" date');
      assert.equals(pg.defaultDb.jsFieldToPg('map', {type: 'object',
                                                      default: {treasure: 'lost'}}),
                    `"map" jsonb DEFAULT '{"treasure":"lost"}'::jsonb`);
    },

    "test connection" () {
      /**
       * Create a new database Client connected to the `url`
       *
       * @param [name] The name to give to the connection. By default
       * it is the schema name.
       **/
      api.method('connect');
      var db = pg.connect(
        "host=/var/run/postgresql dbname=korutest options='-c search_path=public,pg_catalog'"
      );
      assert.equals(db.query('select 1 as a'), [{a: 1}]);
      assert.same(db.schemaName, 'public');
      assert.same(db.name, 'public');

      var conn2 = pg.connect("postgresql://localhost/korutest", 'conn2');
      assert.same(conn2.name, 'conn2');
    },

    "test defaultDb" () {
      /**
       * Return the default Client database connection.
       *
       **/
      api.property('defaultDb');
      var db = pg.defaultDb;
      assert.same(db, pg.defaultDb);
      api.done();
      assert.same(db.name, 'default');


      db.query('CREATE TABLE "Foo" (_id varchar(24) PRIMARY KEY, "foo" jsonb)');
      db.query('INSERT INTO "Foo" ("_id","foo") values ($1::text,$2::jsonb)', ['123', JSON.stringify({a: 1})]);
      db.query('INSERT INTO "Foo" ("_id","foo") values ($1::text,$2::jsonb)', ['456', JSON.stringify([1])]);

      assert.same(db.query('SELECT EXISTS(SELECT 1 FROM "Foo" WHERE "_id">$1)', [''])[0].exists, true);
      assert.equals(db.query('select 1+1 as a')[0], {a: 2});
      assert.equals(db.query('select 1 as a; select 2 as b'), [{b: 2}]);
    },

    "test isPG" () {
      assert.same(pg.isPG, true);
    },

    "test aryToSqlStr" () {
      v.foo = pg.defaultDb.table('Foo');
      assert.same(v.foo.aryToSqlStr, pg.defaultDb.aryToSqlStr);

      assert.equals(v.foo.aryToSqlStr([1,2,"three",null]), '{1,2,"three",null}');
    },

    "test insert suffix" () {
      v.foo = pg.defaultDb.table('Foo', {
        _id: 'integer',
        name: 'text',
      });

      assert.equals(v.foo.insert({_id: 123, name: 'a name'}, 'RETURNING name'), [{name: 'a name'}]);
    },

    "test override _id spec" () {
      v.foo = pg.defaultDb.table('Foo', {
        _id: 'integer',
      });

      assert.same(v.foo.dbType('_id'), 'integer');

      v.foo.insert({_id: 123});
      assert.isTrue(v.foo.exists({_id: 123}));
      assert.exception(function () {
        v.foo.insert({_id: 123});
      }, {sqlState: '23505', message: TH.match(/violates unique constraint "Foo_pkey"/)});
    },

    "test Array insert" () {
      v.foo = pg.defaultDb.table('Foo', {
        bar_ids: 'has_many',
      });

      assert.same(v.foo.dbType('bar_ids'), 'varchar(24) ARRAY');

      v.foo.insert({_id: '123', bar_ids: ["1","2","3"]});
      assert.equals(v.foo.findOne({}).bar_ids, ['1', '2', '3']);
    },

    "test Array in jsonb" () {
      v.foo = pg.defaultDb.table('Foo', {
        bar_ids: 'object',
      });

      assert.same(v.foo.dbType('bar_ids'), 'jsonb');
      v.foo.insert({_id: '123', bar_ids: ["1",{a: v.date = new Date()}]});
      assert.equals(v.foo.findOne({}).bar_ids, ['1', {a: v.date.toISOString()}]);
    },

    "test $elemMatch" () {
      v.foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });

      v.foo.insert({_id: '123', widget: [{id: "1", value: 200}, {id: "5", value: 500}, {id: "2", value: 100}]});
      v.foo.insert({_id: '234', widget: [{id: "1", value: 100}, {id: "4", value: 400}, {id: "3", value: 200}]});

      assert.equals(v.foo.count({widget: {$elemMatch: {id: "1", value: {$in: null}}}}), 0);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "1", value: {$in: [100, 200]}}}}), 2);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "1", value: {$in: [100, 300]}}}}), 1);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "4"}}}), 1);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "6"}}}), 0);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "1"}}}), 2);
      assert.equals(v.foo.count({widget: {$elemMatch: {id: "1", value: 100}}}), 1);
    },

    "test multipart key" () {
      v.foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });
      v.foo.insert({_id: '123', widget: {a: {b: {c: 1}}}});

      assert.equals(v.foo.count({'widget.a.b.c': 1}), 1);
      assert.equals(v.foo.count({'widget.a.b.c': 2}), 0);
      assert.equals(v.foo.count({'widget.a.b': {c: 1}}), 1);
      assert.equals(v.foo.count({'widget.a.b': {c: 2}}), 0);
      assert.equals(v.foo.count({'widget.a.b': [{c: 2}, {c: 1}]}), 1);
      assert.equals(v.foo.count({'widget.a.b': [{c: 2}, {c: 3}]}), 0);
    },

    "test values" () {
      v.foo = pg.defaultDb.table('Foo', {
        widget: 'object',
        lots: 'integer[]',
        createdOn: 'date',
        updatedAt: 'timestamp',
      });
      var data = {
        widget: "a",
        lots: [11,23,44],
        createdOn: new Date(2015, 5, 12),
        updatedAt: new Date(2014, 11, 27, 23, 45, 55)
      };
      assert.equals(v.foo.values(data), ['"a"', "{11,23,44}", "2015-06-12T00:00:00.000Z", "2014-12-27T23:45:55.000Z"]);
      data.widget = [1,2,{a: 3}];
      assert.equals(v.foo.values(data, ['createdOn', 'widget']), ["2015-06-12T00:00:00.000Z", '[1,2,{"a":3}]']);
    },

    "test string in json" () {
      v.foo = pg.defaultDb.table('Foo', {
        widget: 'object',
      });
      v.foo.insert({_id: '123', widget: "dodacky"});

      assert.equals(v.foo.count({widget: "dodacky"}), 1);
      assert.equals(v.foo.count({widget: "wazzit"}), 0);
    },

    "test ARRAY column" () {
      v.foo = pg.defaultDb.table('Foo', {
        widget: 'integer[]',
      });

      assert.same(v.foo.dbType('widget'), 'integer[]');

      v.foo.insert({_id: '123', widget: [1,2,3]});
      v.foo.insert({_id: '456', widget: [3,4]});

      assert.equals(v.foo.count({'widget': 2}), 1);
      assert.equals(v.foo.count({'widget': 3}), 2);
      assert.equals(v.foo.count({'widget': 5}), 0);
      assert.equals(v.foo.count({'widget': {$in: [1,3]}}), 2);
      assert.equals(v.foo.count({'widget': {$nin: [1,3]}}), 0);
      assert.equals(v.foo.count({'widget': {$nin: [4,5]}}), 1);
      assert.equals(v.foo.count({'widget': {$in: []}}), 0);
      assert.equals(v.foo.count({'widget': {$nin: []}}), 2);
    },

    "test date" () {
      v.foo = pg.defaultDb.table('Foo', {
        createdOn: 'date',
      });

      assert.same(v.foo.dbType('createdOn'), 'date');

      v.foo.insert({_id: '123', createdOn: v.date = new Date(2015, 3, 4)});

      assert.equals(v.foo.count({createdOn: v.date}), 1);
      assert.equals(v.foo.count({createdOn: new Date(2015, 3, 5)}), 0);
      assert.equals(v.foo.count({createdOn: '2015/04/04'}), 1);
      assert.equals(v.foo.values({createdOn: '2015/04/04'}), ['2015-04-04T00:00:00.000Z']);
      assert.equals(v.foo.values({createdOn: new Date('2015/04/04').getTime()}), ['2015-04-04T00:00:00.000Z']);

    },

    "test $regex" () {
       v.foo = pg.defaultDb.table('Foo', {
         story: 'text',
      });

      v.foo.insert({_id: '123', story: "How now brown cow"});

      assert.equals(v.foo.count({story: {$regex: "how"}}), 0);
      assert.equals(v.foo.count({story: {$regex: "cow$"}}), 1);
      assert.equals(v.foo.count({story: {$regex: "how", $options: "i"}}), 1);
      assert.equals(v.foo.count({story: {$options: "i", $regex: "how"}}), 1);
    },

    "find": {
      setUp () {
        v.foo = pg.defaultDb.table('Foo', {
          name: 'text',
          createdAt: 'timestamp',
          version: 'integer',
          age: {type: 'number', default: 10}
        });

        test.spy(v.foo, '_ensureTable');
        v.foo.transaction(function () {
          "one two three four five".split(' ').forEach(function (name, i) {
            v.foo.insert({_id: name+i, name: name, createdAt: new Date(util.dateNow()-i*1e6)});
          });
        });
        assert.called(v.foo._ensureTable);
      },

      "test bad sql" () {
        var cursor = v.foo.find({age: 'hello'});

        assert.exception(function () {
          try {
            cursor.next();
          }
          finally {
            cursor.close();     // should not raise error
          }
        }, {message: TH.match(/invalid input syntax.*hello/)});
      },

      "test array param" () {
        assert.equals(v.foo.count({name: ['one', 'three']}), 2);
        assert.equals(v.foo.count({name: []}), 0);
        assert.equals(v.foo.count({name: ['four']}), 1);

        assert.equals(v.foo.count({name: {$in: ['one', 'three']}}), 2);
        assert.equals(v.foo.count({name: {$in: []}}), 0);
        assert.equals(v.foo.count({name: {$in: ['four']}}), 1);

        assert.equals(v.foo.count({name: {$nin: ['one', 'three']}}), 3);
        assert.equals(v.foo.count({name: {$nin: []}}), 5);
        assert.equals(v.foo.count({name: {$nin: ['four']}}), 4);
      },

      "test named params on _client" () {
        var client = v.foo._client;
        assert.equals(client.query('select count(*) from "Foo" where name like {$likeE} OR name = {$four}', {likeE: '%e', four: 'four'}),
                      [{count: '4'}]);
      },

      "test $sql" () {
        assert.equals(v.foo.count({$sql: "name like '%e'"}), 3);
        assert.equals(v.foo.count({$sql: ["name like {$likeE} OR name = {$four}", {likeE: '%e', four: 'four'}]}), 4);
        assert.equals(v.foo.count({$sql: ["name like $1 OR name = $2", ['%e', 'four']]}), 4);
      },

      "test fields" () {
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

      "test cursor next" () {
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

      "test cursor with options" () {
        var cursor = v.foo.find({age: 10}, {limit: 1, sort: {name: 1}});
        try {
          assert.equals(cursor.next(2), [mf('name', 'five')]);
        } finally {
          cursor.close();
        }
      },
    },

    "Static table": {
      setUp () {
        v.foo = pg.defaultDb.table('Foo', {
          name: 'text',
          age: {type: 'number', default: 10}
        });

        v.foo.insert({_id: "123", name: 'abc'});
        v.foo.insert({_id: "456", name: 'def'});
      },

      "test ensureIndex" () {
        v.foo.ensureIndex({name: -1}, {unique: true});

        v.foo.insert({_id: '1', name: "Foo"});
        assert.exception(function () {
          v.foo.insert({_id: '2', name: "Foo"});
        }, {sqlState: '23505'});

        v.foo.ensureIndex({name: -1}, {unique: true});
        v.foo.ensureIndex({name: 1, _id: -1});
      },

      "test query all" () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc", age: 10}, {_id: "456", name: "def", age: 10}]);
      },

      "test $inequality" () {
        v.foo.insert({_id: "789", name: 'ghi'});
        assert.same(v.foo.count({name: {$regex: '[AG]', $ne: 'ghi', $options: 'i'}}), 1);
        assert.same(v.foo.count({name: {$gt: 'abc', $lt: 'ghi'}}), 1);
        assert.same(v.foo.count({name: {$gt: 'abc', $ne: 'def'}}), 1);
        assert.same(v.foo.count({name: {$gte: 'abc', $in: ['def', 'ghi']}}), 2);
        assert.same(v.foo.count({age: {$ne: 10}}), 0);
        assert.same(v.foo.count({name: {$ne: 'abc'}}), 2);
        assert.same(v.foo.count({name: {$ne: 'aabc'}}), 3);
        assert.same(v.foo.count({name: {$gte: 'abcd'}}), 2);
        assert.same(v.foo.count({name: {$gt: 'abc'}}), 2);
        assert.same(v.foo.count({name: {$lte: 'abc'}}), 1);
        assert.same(v.foo.count({name: {$lte: 'abc'}}), 1);
        assert.same(v.foo.count({name: {$lt: 'abc'}}), 0);
        assert.same(v.foo.count({name: null}), 0);
        assert.same(v.foo.count({name: {$ne: null}}), 3);
      },

      "test can't add field" () {
        assert.exception(function () {
          v.foo.update({name: 'abc'}, {$set: {foo: 'eee'}});
        }, {sqlState: '42703'});
      },

      "test nested transactions" () {
        try {
          v.foo.transaction(function (tran) {
            v.foo.update({_id: '123'}, {$set: {name: 'eee'}});
            tran.onAbort(v.onAbort = test.stub());
            tran.onAbort(v.onAbort2 = test.stub());
            try {
              v.foo.transaction(function (tran) {
                tran.onAbort(v.onAbort3 = test.stub());
                v.foo.update({_id: '123'}, {$set: {name: 'fff'}});
                throw 'abort';
              });
            } catch(ex) {
              refute.same(ex, 'abort');
              throw ex;
            }
            assert.called(v.onAbort3);
            refute.called(v.onAbort);
            assert.equals(v.foo.findOne({_id: '123'}).name, 'eee');
            throw 'abort';
          });
        } catch(ex) {
          refute.same(ex, 'abort');
          throw ex;
        }
        assert.called(v.onAbort);
        assert.called(v.onAbort2);
        assert.calledOnce(v.onAbort3);
        assert.equals(v.foo.findOne({_id: '123'}).name, 'abc');

        // ensure inner transaction works

        v.foo.transaction(function (tran) {
          tran.onAbort(v.onAbort = test.stub());
          v.foo.transaction(function (tran) {
            v.foo.update({_id: '123'}, {$set: {name: 'fff'}});
          });
          assert.equals(v.foo.findOne({_id: '123'}).name, 'fff');
          throw 'abort';
        });
        assert.equals(v.foo.findOne({_id: '123'}).name, 'abc');


        // ensure transaction commit works

        v.foo.transaction(function (tran) {
          tran.onAbort(v.onAbort = test.stub());
          v.foo.transaction(function (tran) {
            v.foo.update({_id: '123'}, {$set: {name: 'fff'}});
          });
        });
        assert.equals(v.foo.findOne({_id: '123'}).name, 'fff');
        refute.called(v.onAbort);
      },

      "test update schema" () {
        v.foo.schema = {
          name: 'text',
          age: {type: 'number', default: 10},
          createdAt: 'timestamp',
        };
        v.foo.update({name: 'abc'}, {$set: {name: 'eee'}});
        assert.equals(v.foo.query({name: 'eee'}), [{_id: "123", name: "eee", age: 10}]);
        v.foo.update({_id: '123'}, {$set: {createdAt: v.createdAt = new Date()}});
        assert.equals(v.foo.findOne({_id: "123"}).createdAt, v.createdAt);
      },
    },

    "Dynamic table": {
      setUp () {
        v.foo = pg.defaultDb.table('Foo');

        assert.same(v.foo.insert({_id: "123", name: 'abc'}), 1);
        v.foo.insert({_id: "456", name: 'abc'});
      },

      "test transaction rollback" () {
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

      "test query all" () {
        assert.equals(v.foo.query({}), [{_id: "123", name: "abc"}, {_id: "456", name: "abc"}]);
      },

      "test update" () {
        assert.same(v.foo.update({name: 'abc'}, {$set: {name: 'def'}}), 2);

        assert.equals(v.foo.query({name: 'def'}), [{_id: "123", name: "def"}, {_id: "456", name: "def"}]);
        assert.same(v.foo.update({_id: '123'}, {$set: {name: 'zzz', age: 7}}), 1);

        assert.equals(v.foo.query({_id: "123"}), [{_id: "123", name: "zzz", age: 7}]);
        assert.equals(v.foo.findOne({_id: "123"}), {_id: "123", name: "zzz", age: 7});
        assert.equals(v.foo.findOne({_id: "456"}), {_id: "456", name: "def"});
      },

      "test count" () {
        assert.same(v.foo.count({name: 'abc'}), 2);
      },

      "test exists" () {
        assert.isTrue(v.foo.exists({name: 'abc'}));
        assert.isFalse(v.foo.exists({name: 'abcx'}));
      },

      "test remove" () {
        assert.same(v.foo.remove({_id: '123'}), 1);


        assert.equals(v.foo.query({}), [{_id: "456", name: "abc"}]);

        v.foo.remove({});

        assert.equals(v.foo.query({}), []);
      },

      "test truncate" () {
        v.foo.truncate();

        assert.equals(v.foo.query({}), []);
      },
    },
  });
});
