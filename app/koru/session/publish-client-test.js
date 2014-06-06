isClient && define(function (require, exports, module) {
  var test, v;
  var util = require('../util');
  var TH = require('./test-helper');
  var publish = require('./publish');
  var Model = require('../model/main');
  var session = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
    },

    tearDown: function () {
      v.handles.forEach(function (h) {h.stop()});
      v = null;
    },

    "test filter Models": function () {
      test.stub(session, 'sendM');
      v.F1 = Model.define('F1').defineFields({name: 'text'});
      v.F2 = Model.define('F2').defineFields({name: 'text'});

      var fdoc = v.F1.create({name: 'A'});
      v.F1.create({name: 'A'});
      var fdel = v.F1.create({name: 'X'});

      v.F2.create({name: 'A2'});
      v.F2.create({name: 'X2'});
      v.F2.create({name: 'X2'});

      v.handles.push(v.F1.onChange(v.f1del = test.stub()));

      v.handles.push(publish._registerMatch('F1', function (doc) {
        return doc.name === 'A';
      }));


      v.handles.push(publish._registerMatch('F2', function (doc) {
        return doc.name === 'A2';
      }));

      try {
        publish._filterModels({F1: true});

        assert.same(v.F1.query.count(), 2);
        assert.same(v.F2.query.count(), 3);

        assert.calledWith(v.f1del, null, TH.match(function (doc) {
          return doc._id = fdel._id;
        }));

        fdoc.attributes.name = 'X';

        publish._filterModels({F1: true, F2: true});

        assert.same(v.F1.query.count(), 1);
        assert.same(v.F2.query.count(), 1);

      } finally {
        Model._destroyModel('F1', 'drop');
        Model._destroyModel('F2', 'drop');
      };
    },

    "test false matches": function () {
      v.handles.push(publish._registerMatch('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(publish._registerMatch('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));


      assert.isFalse(publish._matches(v.doc));
    },


    "test true matches": function () {
      v.handles.push(publish._registerMatch('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(v.t = publish._registerMatch('Foo', function (doc) {
        assert.same(doc, v.doc);
        return true;
      }));


      assert.isTrue(publish._matches(v.doc));
      v.t.stop();

      assert.isFalse(publish._matches(v.doc));
    },
  });
});
