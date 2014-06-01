isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var publish = require('./publish');

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
