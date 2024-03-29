define((require, exports, module) => {
  'use strict';
  const BTree           = require('koru/btree');
  const DocChange       = require('koru/model/doc-change');
  const util            = require('koru/util');
  const dbBroker        = require('./db-broker');
  const Model           = require('./main');
  const TH              = require('./test-helper');

  const {stub, spy, match: m} = TH;

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      Model._destroyModel('TestModel', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo;
      delete Model._databases.bar;
      v = {};
    });

    test('lookup direction -1 bug on client', () => {
      const TestModel = Model.define('TestModel').defineFields({order: 'number', name: 'text'});
      const idx = TestModel.addIndex('order', 1, 'name', '_id');

      const doc1 = TestModel.create({_id: '1', name: 'n1', order: 2});
      const doc3 = TestModel.create({_id: '3', name: 'n2', order: 1});
      const doc2 = TestModel.create({_id: '2', name: 'n2', order: 1});

      assert.equals(Array.from(idx.lookup({order: 1, name: 'n2'}, {direction: -1})), [{_id: '3', name: 'n2'}, {
        _id: '2',
        name: 'n2',
      }]);

      assert.equals(Array.from(idx.lookup({order: 2}, {from: {name: 'n1'}, direction: -1})), [{_id: '1', name: 'n1'}]);

      const btree = idx.entries[1];
    });

    test('filtering', () => {
      const TestModel = Model.define('TestModel').defineFields({id1: 'text', id2: 'text', archived: 'boolean'});
      dbBroker.setMainDbId('foo');
      const index = TestModel.addUniqueIndex('id1', 1, 'id2', '_id', (q) => {
        q.where('archived', null);
      });

      const doc1 = TestModel.create({_id: 'doc1', id1: 'a', id2: 'b'});
      const doc2 = TestModel.create({_id: 'doc2', id1: 'a', id2: 'b'});
      assert.same(index.entries.a.size, 2);
      doc1.$remove();
      assert.same(index.entries.a.size, 1);
      doc2.$update('archived', true);
      assert.same(index.entries.a, undefined);

      doc2.$update({archived: null, id1: 'b'});
      assert.same(index.entries.a, undefined);
      assert.same(index.entries.b.size, 1);
      doc2.$update({id1: 'a'});
      assert.same(index.entries.a.size, 1);
      assert.same(index.entries.b, undefined);
    });

    group('id1, id2', () => {
      let TestModel;
      beforeEach(() => {
        TestModel = Model.define('TestModel').defineFields({id1: 'text', id2: 'text'});
        dbBroker.setMainDbId('foo');

        v.obSpy = spy(TestModel._indexUpdate, 'onChange');
        v.idx = TestModel.addUniqueIndex('id2', 'id1');

        v.doc1 = TestModel.create({_id: 'doc1', id1: '3', id2: '4'});
        v.doc2 = TestModel.create({_id: 'doc2', id1: '2', id2: '2'});
        v.doc3 = TestModel.create({_id: 'doc3', id1: '1', id2: '4'});
      });

      group('btree', () => {
        beforeEach(() => {
          TestModel.defineFields({
            points: 'number',
            updatedAt: 'timestamp',
            name: 'text',
            code: {type: 'ascii', default: ''},
          });

          v.doc1.attributes.points = 5;
          v.doc2.attributes.points = 15;
          v.doc3.attributes.points = 5;

          v.doc1.attributes.updatedAt = new Date(2017, 1, 5);
          v.doc2.attributes.updatedAt = new Date(2017, 1, 15);
          v.doc3.attributes.updatedAt = new Date(2017, 1, 5);

          v.sortedIndex = TestModel.addIndex('id2', -1, 'points', 'updatedAt');
        });

        test('en-US compare', () => {
          v.sortedIndex = TestModel.addIndex('id1', 1, 'updatedAt', 'name', -1, 'code', 'updatedAt');
          const updatedAt = new Date();
          const n1 = TestModel.create({_id: 'n1', id1: 'x', updatedAt, name: 'Helen'});
          const n2 = TestModel.create({_id: 'n2', id1: 'x', updatedAt, name: 'david', code: 'ax'});
          const n3 = TestModel.create({_id: 'n3', id1: 'x', updatedAt, name: 'david', code: 'Tx'});
          const n4 = TestModel.create({
            _id: 'n4',
            id1: 'x',
            updatedAt: new Date(+updatedAt + 399),
            name: 'Alan',
            code: 'Tx',
          });

          const tree = v.sortedIndex.entries.x;
          assert(tree instanceof BTree);

          const data = Array.from(tree);

          assert.equals(data.map((d) => d.name + d.code), ['davidax', 'davidTx', 'Helen', 'AlanTx']);
        });

        test('partially sorted', () => {
          v.sortedIndex = TestModel.addIndex('points', 1, 'updatedAt');

          assert.equals(v.sortedIndex.compare.compareKeys, ['points', 'updatedAt', '_id']);
          assert.equals(v.sortedIndex.compare({points: 1}, {points: 1}), 0);
          assert.equals(v.sortedIndex.compare({points: 1}, {points: 2}), -2);
          assert.equals(v.sortedIndex.compare({points: 1, updatedAt: 124}, {points: 1, updatedAt: 123}), 1);
        });

        test('fully sorted', () => {
          v.sortedIndex = TestModel.addIndex(-1, 'points', 'updatedAt');

          assert.equals(v.sortedIndex.compare.compareKeys, ['points', 'updatedAt', '_id']);
          assert.equals(v.sortedIndex.compare({points: 1}, {points: 2}), 1);
          assert.equals(v.sortedIndex.compare({points: 1, updatedAt: 124}, {points: 1, updatedAt: 123}), -1);

          const tree = v.sortedIndex.entries;
          assert(tree instanceof BTree);
          const a4 = TestModel.create({_id: 'a4', id1: '1', id2: '4', points: 5, updatedAt: new Date(2017, 1, 3)});
          assert.equals(Array.from(tree.values({from: {points: 5, updatedAt: new Date(2017, 1, 5)}})), [
            {points: 5, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
            {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
            {points: 5, updatedAt: a4.updatedAt, _id: 'a4'},
          ]);

          const data = TestModel.query.fetch();

          assert.equals(data.sort(v.sortedIndex.compare).map((d) => d._id), ['doc2', 'doc3', 'doc1', 'a4']);

          a4.$update({$partial: {points: ['$replace', 7]}});

          assert.equals(Array.from(tree.values({from: {points: 7, updatedAt: new Date(2017, 1, 5)}})), [
            {points: 7, updatedAt: a4.updatedAt, _id: 'a4'},
            {points: 5, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
            {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
          ]);

          a4.$remove();

          assert.equals(Array.from(tree.values({from: {points: 7, updatedAt: new Date(2017, 1, 5)}})), [{
            points: 5,
            updatedAt: v.doc3.updatedAt,
            _id: 'doc3',
          }, {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'}]);
        });

        test('add', () => {
          const iter = v.sortedIndex.lookup({id2: '4'});
          assert.isFunction(iter.next);

          const a4 = TestModel.create({_id: 'a4', id1: '1', id2: '4', points: 5, updatedAt: new Date(2017, 1, 3)});

          assert.equals(Array.from(v.sortedIndex.lookup({id2: '4', points: 5, updatedAt: new Date(2017, 1, 5)})), [
            {points: 5, updatedAt: v.doc3.updatedAt, _id: 'doc3'},
            {points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'},
            {points: 5, updatedAt: a4.updatedAt, _id: 'a4'},
          ]);

          // ensure no duplicate adds
          TestModel._indexUpdate.notify(DocChange.add(a4));

          assert.equals(v.sortedIndex.entries[4].size, 3);

          const iter2 = v.sortedIndex.lookup({id2: '4', points: 5, updatedAt: new Date(2017, 1, 4)});
          assert.equals(Array.from(iter2), [{points: 5, updatedAt: a4.updatedAt, _id: 'a4'}]);

          const reverseCursor = v.sortedIndex.lookup({id2: '4', points: 5, updatedAt: new Date(2017, 1, 4)}, {
            direction: -1,
          });
          assert(reverseCursor.next);
          assert.equals(Array.from(reverseCursor), [{points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'}, {
            points: 5,
            updatedAt: v.doc3.updatedAt,
            _id: 'doc3',
          }]);

          assert.equals(Array.from(v.sortedIndex.lookup({id2: '4'}, {direction: -1})).map((d) => d._id), [
            'a4',
            'doc1',
            'doc3',
          ]);

          assert(v.sortedIndex.entries[4] instanceof BTree);
        });

        test('remove', () => {
          v.doc2.$remove();
          assert.same(v.sortedIndex.lookup({id2: '2'}), undefined);

          v.doc1.$remove();

          const tree = v.sortedIndex.entries[4];
          assert.equals(tree.size, 1);

          v.doc3.$remove();

          assert.equals(tree.size, 0);
          assert.equals(v.sortedIndex.lookup({}), {});
        });

        test('change same tree', () => {
          const tree = v.sortedIndex.entries[4];
          assert.equals(tree.size, 2);
          v.doc3.$update('points', 3);
          assert.equals(tree.size, 2);

          assert.equals(Array.from(tree), [{points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'}, {
            points: 3,
            updatedAt: v.doc3.updatedAt,
            _id: 'doc3',
          }]);

          v.doc1.$update('id1', '8');

          assert.equals(Array.from(tree), [{points: 5, updatedAt: v.doc1.updatedAt, _id: 'doc1'}, {
            points: 3,
            updatedAt: v.doc3.updatedAt,
            _id: 'doc3',
          }]);
        });

        test('change different tree', () => {
          v.doc3.$update('id2', '2');

          const tree2 = v.sortedIndex.entries[2];
          assert.equals(tree2.size, 2);

          const tree4 = v.sortedIndex.entries[4];
          assert.equals(tree4.size, 1);

          assert.equals(Array.from(tree2).map((d) => d._id), ['doc2', 'doc3']);
        });
      });

      test('changing dbId', () => {
        dbBroker.dbId = 'bar';

        const bar1 = TestModel.create({id1: '3', id2: '4'});

        assert.same(v.idx.lookup({id1: '3', id2: '4'}), bar1._id);

        dbBroker.dbId = 'foo';

        assert.same(v.idx.lookup({id1: '3', id2: '4'}), v.doc1._id);

        v.doc1.id1 = '4';
        v.doc1.$$save();

        dbBroker.dbId = 'bar';

        assert.same(v.idx.lookup({id1: '3', id2: '4'}), bar1._id);

        bar1.$update('id1', '4');

        assert.same(v.idx.lookup({id1: '4', id2: '4'}), bar1._id);

        dbBroker.dbId = 'foo';

        assert.same(v.idx.lookup({id1: '4', id2: '4'}), v.doc1._id);
      });

      test('adding', () => {
        assert.same(v.idx.lookup({id1: '3', id2: '4'}), v.doc1._id);

        assert.equals(v.idx.lookup({id2: '4'}), {1: v.doc3._id, 3: v.doc1._id});
      });

      test('changing', () => {
        v.doc1.id1 = '4';
        v.doc1.$$save();

        assert.same(v.idx.lookup({id1: '4', id2: '4'}), v.doc1._id);
        assert.same(v.idx.lookup({id1: '3', id2: '4'}), undefined);

        v.doc2.$update({id2: '4'});

        assert.equals(v.idx.lookup({}), {4: {4: v.doc1._id, 2: v.doc2._id, 1: v.doc3._id}});
      });

      test('nullToUndef keys', () => {
        v.doc1.id2 = null;
        v.doc1.$$save();

        assert.equals(v.idx.lookup({id1: '3'}), {2: {2: 'doc2'}, 4: {1: 'doc3'}, undefined: {3: 'doc1'}});
      });

      test('null in data', () => {
        const doc = TestModel.create({id1: '1', id2: null});

        assert.same(v.idx.lookup({id1: '1', id2: undefined}), doc._id);
      });

      test('deleting', () => {
        v.doc1.$remove();

        assert.equals(v.idx.lookup({}), {4: {1: v.doc3._id}, 2: {2: v.doc2._id}});
      });

      test('removing wrong object', () => {
        assert.calledOnce(v.obSpy);

        const doc = {
          _id: 'diff',
          id2: '4',
          id1: '3',
          $withChanges(undo) {
            return undo === 'add' ? this : null;
          },
        };

        v.obSpy.yield(DocChange.delete(doc));

        assert.equals(v.idx.lookup({id2: '4', id1: '3'}), v.doc1._id);
      });

      test('reload', () => {
        const docs = v.idx.lookup({});
        docs['x'] = 'junk';

        v.idx.reload();

        assert.equals(Object.keys(v.idx.lookup({})), ['2', '4']);

        assert.equals(v.idx.lookup({id2: '4'}), {1: 'doc3', 3: 'doc1'});
      });

      test('addIndex', () => {
        const id1Idx = TestModel.addIndex('id1');

        TestModel.create({_id: 'tm1', id1: '2', id2: '5'});

        assert.equals(id1Idx.lookup({}), {1: {doc3: 'doc3'}, 2: {doc2: 'doc2', tm1: 'tm1'}, 3: {doc1: 'doc1'}});
      });

      test('addIndex with condition', () => {
        Model._destroyModel('TestModel', 'drop');
        TestModel = Model.define('TestModel').defineFields({id1: 'text', id2: 'text'});

        v.test = (doc) => {
          return doc.id2 === '4';
        };
        const id1Idx = TestModel.addIndex('id1', (q) => q.where(v.test));

        const tm1 = TestModel.create({_id: 'tm1', id1: '2', id2: '6'});
        const tm2 = TestModel.create({_id: 'tm2', id1: '1', id2: '4'});
        const tm3 = TestModel.create({_id: 'tm3', id1: '1', id2: '4'});

        assert.equals(id1Idx.lookup({}), {1: {tm2: 'tm2', tm3: 'tm3'}});

        tm2.$update('id2', '3');
        assert.equals(id1Idx.lookup({id1: '1'}), {tm3: 'tm3'});

        tm2.$update('id2', '4');
        assert.equals(id1Idx.lookup({id1: '1'}), {tm2: 'tm2', tm3: 'tm3'});
      });

      test('reloadAll', () => {
        const id1Idx = TestModel.addIndex('id1');

        assert.same(TestModel._indexUpdate.indexes.size, 2);

        id1Idx.lookup({})['x'] = 'junk';
        v.idx.lookup({})['x'] = 'junk';

        TestModel._indexUpdate.reloadAll();

        assert.equals(Object.keys(v.idx.lookup({})), ['2', '4']);

        assert.equals(Object.keys(id1Idx.lookup({})), ['1', '2', '3']);
      });
    });
  });
});
