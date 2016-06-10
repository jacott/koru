define(function (require, exports, module) {
  'use strict';
  var test, v;
  var TH = require('./test-helper');
  var Model = require('./main');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestModel = Model.define('TestModel').defineFields({
        id1: 'text',
        id2: 'text',
      });
      util.setMainDbId('foo');

      v.obSpy = test.spy(v.TestModel._indexUpdate, 'onChange');
      v.idx = v.TestModel.addUniqueIndex('id2', 'id1');

      v.doc1 = v.TestModel.create({id1: '3', id2: '4'});
      v.doc2 = v.TestModel.create({id1: '2', id2: '2'});
      v.doc3 = v.TestModel.create({id1: '1', id2: '4'});
    },

    tearDown: function () {
      Model._destroyModel('TestModel', 'drop');
      util.clearDbId();
      delete Model._databases.foo;
      delete Model._databases.bar;
      v = null;
    },

    "test changing dbId": function () {
      util.dbId = 'bar';

      var bar1 = v.TestModel.create({id1: '3', id2: '4'});

      assert.same(v.idx({id1: '3', id2: '4'}), bar1._id);

      util.dbId = 'foo';

      assert.same(v.idx({id1: '3', id2: '4'}), v.doc1._id);

      v.doc1.id1 = '4';
      v.doc1.$$save();

      util.dbId = 'bar';

      assert.same(v.idx({id1: '3', id2: '4'}), bar1._id);

      bar1.$update('id1', '4');

      assert.same(v.idx({id1: '4', id2: '4'}), bar1._id);

      util.dbId = 'foo';

      assert.same(v.idx({id1: '4', id2: '4'}), v.doc1._id);
    },

    "test adding": function () {
      assert.same(v.idx({id1: '3', id2: '4'}), v.doc1._id);

      assert.equals(v.idx({id2: '4'}), {'1': v.doc3._id, '3': v.doc1._id});
    },

    "test changing": function () {
      v.doc1.id1 = '4';
      v.doc1.$$save();

      assert.same(v.idx({id1: '4', id2: '4'}), v.doc1._id);
      assert.same(v.idx({id1: '3', id2: '4'}), undefined);

      v.doc2.$update({id2: '4'});

      assert.equals(v.idx({}), {'4': {'4': v.doc1._id, '2': v.doc2._id, '1': v.doc3._id}});
    },

    "test null in data": function () {
      var doc = v.TestModel.create({id1: '1', id2: null});

      assert.same(v.idx({id1: '1', id2: null}), doc._id);
    },

    "test deleting": function () {
      v.doc1.$remove();

      assert.equals(v.idx({}), {'4': {'1': v.doc3._id}, '2': {'2': v.doc2._id}});
    },

    "test removing wrong object": function () {
      assert.calledOnce(v.obSpy);

      v.obSpy.yield(null, {_id: 'diff', id2: '4', id1: '3'});

      assert.equals(v.idx({id2: '4', id1: '3'}), v.doc1._id);
    },

    "test fetch": function () {
      assert.equals(util.mapField(v.idx.fetch({id2: '4'})
                                     .sort(util.compareByField('id1')), 'attributes'),
                    [v.doc3.attributes, v.doc1.attributes]);

      assert.equals(util.mapField(v.idx.fetch({})
                                     .sort(util.compareByField('id1')), 'attributes'),
                    [v.doc3.attributes, v.doc2.attributes, v.doc1.attributes]);
    },

    "test reload": function () {
      var docs = v.idx({});
      docs['x'] = 'junk';

      v.idx.reload();

      assert.equals(Object.keys(v.idx({})), ["2", "4"]);

      assert.equals(util.mapField(v.idx.fetch({id2: '4'})).sort(), [v.doc1._id, v.doc3._id].sort());
    },

    "test addIndex": function () {
      var id1Idx = v.TestModel.addIndex('id1');

      v.TestModel.create({id1: '2', id2: '5'});


      var docs = id1Idx.fetch({id1: '2'});

      assert.equals(util.mapField(docs, 'id2').sort(), ["2", "5"]);
    },

    "test reloadAll": function () {
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
