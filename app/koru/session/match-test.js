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
      v.handles.push(v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(v.t = v.match.register('Foo', function (doc) {
        assert.same(doc, v.doc);
        return true;
      }));


      assert.isTrue(v.match.has(v.doc));
      v.t.stop();

      assert.isFalse(v.match.has(v.doc));
    },
  });
});
