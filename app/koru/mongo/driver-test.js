isServer && process.env['KORU_USE_MONGO'] && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var sut = require('./driver');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test dropAllIndexes"() {
      var col =  sut.defaultDb.table('Fooy');
      test.onEnd(function () {
        sut.defaultDb.dropTable('Fooy');
      });

      assert.equals(col.indexInformation(), {});

      col.ensureIndex({name: 1});
      assert.equals(col.indexInformation().name_1, [["name", 1]]);

      col.dropAllIndexes();
      assert.same(col.indexInformation().name_1, undefined);
    },

    "with table": {
      setUp() {
        v.foo = sut.defaultDb.table('Foo');

        v.foo.insert({_id: "123", name: 'abc'});
        v.foo.insert({_id: "456", name: 'abc'});
      },

      tearDown() {
        sut.defaultDb.dropTable('Foo');
      },


      "test update"() {
        assert.same(v.foo.update({name: 'abc'}, {$set: {name: 'def'}}, {multi: true}), 2);
      },

      "test find"() {
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

      "test findOne"() {
        assert.equals(v.foo.findOne({_id: "123"}), {_id: "123", name: 'abc'});
      },

      "test count"() {
        assert.same(v.foo.count({_id: "123"}), 1);
        assert.same(v.foo.count({name: "abc"}), 2);
      },

      "test exists"() {
        assert.isTrue(v.foo.exists({name: 'abc'}));
        assert.isFalse(v.foo.exists({name: 'abcx'}));
      },

      "test ensureIndex"() {
        var ensureIndex = test.stub(v.foo._col, 'ensureIndex', function () {
          arguments[arguments.length -1](null, 'Tsuccess');
        });

        assert.same(v.foo.ensureIndex({name: -1}, {unique: true}), 'Tsuccess');

        assert.calledWith(ensureIndex, {name: -1}, {unique: true});
      },

      "test transaction rollback"() {
        try {
          v.foo.transaction(function (tran) {
            v.foo.update({_id: '123'}, {$set: {name: 'eee'}});
            tran.onAbort(v.onAbort = test.stub());
            tran.onAbort(v.onAbort2 = test.stub());
            assert.equals(v.foo.findOne({_id: '123'}).name, 'eee');
            throw 'abort';
          });
        } catch(ex) {
          if (ex !== 'abort') throw ex;
        }
        assert.called(v.onAbort);
        assert.called(v.onAbort2);
        // mongo can't rollback
        assert.equals(v.foo.findOne({_id: '123'}).name, 'eee');

        // ensure transaction commit works

        v.foo.transaction(function (tran) {
          tran.onAbort(v.onAbort = test.stub());
          v.foo.update({_id: '123'}, {$set: {name: 'fff'}});
        });
        assert.equals(v.foo.findOne({_id: '123'}).name, 'fff');
        refute.called(v.onAbort);
      },
    },

    "test defaultDb"() {
      test.onEnd(function () {
        sut.defaultDb.dropTable('Foo');
      });

      var db = sut.defaultDb;
      assert.same(db, sut.defaultDb);

      var foo = db.table('Foo');
      foo.insert({_id: "foo123", name: 'foo name'});

      assert.equals(foo.findOne({_id: "foo123"}), {_id: "foo123", name: 'foo name'});
    },

    "test table"() {
      var db = sut.connect("mongodb://localhost:3004/koru");
      test.onEnd(function () {
        db.dropTable('foo');
        db.close();
      });
      assert(db);

      var foo = db.table('Foo');
      var id = foo.insert({_id: "foo123", name: 'foo name'})[0]._id;
      assert.same(id, "foo123");

      assert.equals(foo.findOne({_id: "foo123"}), {_id: "foo123", name: 'foo name'});

      foo.remove({}, {multi: true});

      assert.equals(foo.findOne({_id: "foo123"}), null);
    },
  });
});
