define(function (require, exports, module) {
  'use strict';
  const BTree    = require('koru/btree');
  const util     = require('koru/util');
  const dbBroker = require('./db-broker');
  const Model    = require('./main');
  const TH       = require('./test-helper');

  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({
        id1: 'text',
        id2: 'text',
      });
      dbBroker.setMainDbId('foo');

      v.obSpy = test.spy(v.TestModel._indexUpdate, 'onChange');
      v.idx = v.TestModel.addUniqueIndex('id2', 'id1');

      v.doc1 = v.TestModel.create({_id: 'doc1', id1: '3', id2: '4'});
      v.doc2 = v.TestModel.create({_id: 'doc2', id1: '2', id2: '2'});
      v.doc3 = v.TestModel.create({_id: 'doc3', id1: '1', id2: '4'});
    },

    tearDown() {
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo;
      delete Model._databases.bar;
      v = null;
    },

    "btree": {
      setUp() {
        v.TestModel.defineFields({
          points: 'number',
          updatedAt: 'timestamp',
        });

        v.doc1.attributes.points = 5;
        v.doc2.attributes.points = 15;
        v.doc3.attributes.points = 5;

        v.doc1.attributes.updatedAt = new Date(2017, 1, 5);
        v.doc2.attributes.updatedAt = new Date(2017, 1, 15);
        v.doc3.attributes.updatedAt = new Date(2017, 1, 5);

        v.sortedIndex = v.TestModel.addIndex('id2', -1, 'points', 'updatedAt');
      },

      "test add"() {
        const tree = v.sortedIndex({id2: '4'}).container;
        assert(tree instanceof BTree);

        const a4 = v.TestModel.create({
          _id: 'a4', id1: '1', id2: '4', points: 5, updatedAt: new Date(2017, 1, 3)});


        assert.equals(
          Array.from(tree.cursor({from: {points: 5, updatedAt: new Date(2017, 1, 5)}})),
          [{points: 5, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
           {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
           {points: 5, updatedAt: a4.updatedAt, _id: 'a4'}]);

        const cursor = v.sortedIndex({id2: '4', points: 5, updatedAt: new Date(2017, 1, 4)});
        assert(cursor.next);
        assert.equals(Array.from(cursor), [
          {points: 5, updatedAt: a4.updatedAt, _id: 'a4'}
        ]);

        const reverseCursor = v.sortedIndex(
          {id2: '4', points: 5, updatedAt: new Date(2017, 1, 4)},
          {direction: -1}
        );
        assert(reverseCursor.next);

        assert.equals(Array.from(reverseCursor), [
          {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
          {points: 5, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
        ]);
      },

      "test remove"() {
        v.doc2.$remove();
        assert.same(v.sortedIndex({id2: '2'}), undefined);

        v.doc1.$remove();

        const tree = v.sortedIndex({id2: '4'}).container;
        assert.equals(tree.size, 1);

        v.doc3.$remove();

        assert.equals(tree.size, 0);
        assert.equals(v.sortedIndex({}), {});
      },

      "test change same tree"() {
        const tree = v.sortedIndex({id2: '4'}).container;
        assert.equals(tree.size, 2);
        v.doc3.$update('points', 3);
        assert.equals(tree.size, 2);

        assert.equals(Array.from(tree), [
          {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
          {points: 3, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
        ]);

        v.doc1.$update('id1', '8');

        assert.equals(Array.from(tree), [
          {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
          {points: 3, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
        ]);
      },

      "test change different tree"() {
        v.doc3.$update('id2', '2');

        const tree2 = v.sortedIndex({id2: '2'}).container;
        assert.equals(tree2.size, 2);


        const tree4 = v.sortedIndex({id2: '4'}).container;
        assert.equals(tree4.size, 1);

        assert.equals(Array.from(tree2).map(d => d._id), ['doc2', 'doc3']);
      },
    },

    "test changing dbId"() {
      dbBroker.dbId = 'bar';

      var bar1 = v.TestModel.create({id1: '3', id2: '4'});

      assert.same(v.idx({id1: '3', id2: '4'}), bar1._id);

      dbBroker.dbId = 'foo';

      assert.same(v.idx({id1: '3', id2: '4'}), v.doc1._id);

      v.doc1.id1 = '4';
      v.doc1.$$save();

      dbBroker.dbId = 'bar';

      assert.same(v.idx({id1: '3', id2: '4'}), bar1._id);

      bar1.$update('id1', '4');

      assert.same(v.idx({id1: '4', id2: '4'}), bar1._id);

      dbBroker.dbId = 'foo';

      assert.same(v.idx({id1: '4', id2: '4'}), v.doc1._id);
    },

    "test adding"() {
      assert.same(v.idx({id1: '3', id2: '4'}), v.doc1._id);

      assert.equals(v.idx({id2: '4'}), {'1': v.doc3._id, '3': v.doc1._id});
    },

    "test changing"() {
      v.doc1.id1 = '4';
      v.doc1.$$save();

      assert.same(v.idx({id1: '4', id2: '4'}), v.doc1._id);
      assert.same(v.idx({id1: '3', id2: '4'}), undefined);

      v.doc2.$update({id2: '4'});

      assert.equals(v.idx({}), {'4': {'4': v.doc1._id, '2': v.doc2._id, '1': v.doc3._id}});
    },

    "test null in data"() {
      var doc = v.TestModel.create({id1: '1', id2: null});

      assert.same(v.idx({id1: '1', id2: null}), doc._id);
    },

    "test deleting"() {
      v.doc1.$remove();

      assert.equals(v.idx({}), {'4': {'1': v.doc3._id}, '2': {'2': v.doc2._id}});
    },

    "test removing wrong object"() {
      assert.calledOnce(v.obSpy);

      v.obSpy.yield(null, {_id: 'diff', id2: '4', id1: '3'});

      assert.equals(v.idx({id2: '4', id1: '3'}), v.doc1._id);
    },

    "test reload"() {
      var docs = v.idx({});
      docs['x'] = 'junk';

      v.idx.reload();

      assert.equals(Object.keys(v.idx({})), ["2", "4"]);

      assert.equals(v.idx({id2: '4'}), {1: 'doc3', 3: 'doc1'});
    },

    "test addIndex"() {
      var id1Idx = v.TestModel.addIndex('id1');

      v.TestModel.create({_id: 'tm1', id1: '2', id2: '5'});

      assert.equals(id1Idx({}), {
        1: {doc3: 'doc3'}, 2: {doc2: 'doc2', tm1: 'tm1'}, 3: {doc1: 'doc1'}});
    },

    "test reloadAll"() {
      var id1Idx = v.TestModel.addIndex('id1');

      assert.same(v.TestModel._indexUpdate.indexes.size, 2);

      id1Idx({})['x'] = 'junk';
      v.idx({})['x'] = 'junk';

      v.TestModel._indexUpdate.reloadAll();

      assert.equals(Object.keys(v.idx({})), ["2", "4"]);

      assert.equals(Object.keys(id1Idx({})), ["1", "2", "3"]);
    },
  });
});
