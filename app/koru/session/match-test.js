define(function (require, exports, module) {
  var test, v;
  var util = require('../util');
  var TH = require('./test-helper');
  var match = require('./match');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
      v.match = match();
    },

    tearDown: function () {
      v.handles.forEach(function (h) {h.stop()});
      util.thread.db = null;
      v = null;
    },

    "test false matches": function () {
      v.handles.push(v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));


      assert.isFalse(v.match.has(v.doc));
    },


    "test true matches": function () {
      v.handles.push(v.f = v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(v.t = v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return true;
      }));


      assert(v.t.id);
      refute.same(v.t.id, v.f.id);

      util.thread.db = 'foo';
      refute.isTrue(v.match.has(v.doc));
      util.thread.db = null;
      assert.isTrue(v.match.has(v.doc));
      v.t.stop();

      assert.isNull(v.t.id);

      assert.isFalse(v.match.has(v.doc));
    },
  });
});
