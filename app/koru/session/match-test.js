define(function (require, exports, module) {
  var test, v;
  const dbBroker = require('koru/model/db-broker');
  const Model    = require('koru/model/main');
  const util     = require('koru/util');
  const match    = require('./match');
  const TH       = require('./test-helper');

  TH.testCase(module, {
    setUp () {
      test = this;
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
      v.match = match();
    },

    tearDown () {
      v.handles.forEach(function (h) {h.stop()});
      dbBroker.clearDbId();
      v = null;
    },

    "test false matches" () {
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


    "test true matches" () {
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

      if (isClient) {
        dbBroker.pushDbId('foo');
        refute.isTrue(v.match.has(v.doc));
        dbBroker.popDbId();
      } else {
        var orig = dbBroker.dbId;
        try {
          util.thread.db.name = 'foo';
          refute.isTrue(v.match.has(v.doc));
        } finally {
          util.thread.db.name = orig;
        }
      }
      assert.isTrue(v.match.has(v.doc));
      v.t.stop();

      assert.isNull(v.t.id);

      assert.isFalse(v.match.has(v.doc));
    },
  });
});
