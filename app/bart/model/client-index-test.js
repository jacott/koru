define(function (require, exports, module) {
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

      v.obSpy = test.spy(v.TestModel, 'onChange');
      v.idx = v.TestModel.addUniqueIndex('id2', 'id1');

      v.doc1 = v.TestModel.create({id1: '3', id2: '4'});
      v.doc2 = v.TestModel.create({id1: '2', id2: '2'});
      v.doc3 = v.TestModel.create({id1: '1', id2: '4'});
    },

    tearDown: function () {
      Model._destroyModel('TestModel');
      v = null;
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
  });
});
