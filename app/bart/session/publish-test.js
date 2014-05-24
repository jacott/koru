isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('../test');
  var publish = require('./publish');
  var session = require('../session/server-main');
  var core = require('../core');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      publish("foo", v.stub = test.stub());

      assert.same(publish._pubs.foo, v.stub);
      session._onMessage(v.conn = {ws: {send: v.send = test.stub()}}, 'Pfoo|a123'+JSON.stringify([1,2,3]));
      v.sub = v.stub.thisValues[0];
    },

    tearDown: function () {
      v = null;
      publish._destroy('foo');
    },

    "test publish": function () {
      assert('a123' in v.conn._subs);

      assert.calledWith(v.stub, 1, 2, 3);
      assert.same(v.sub.conn, v.conn);
    },

    "test onStop": function () {
      v.sub.onStop(v.onStop = test.stub());

      session._onMessage(v.conn, 'P|a123');
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, 'P|a123');
      assert.calledOnce(v.onStop);
    },

    "test stop": function () {
      v.sub.onStop(v.onStop = test.stub());

      v.sub.stop();
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, 'P|a123');
      assert.calledOnce(v.onStop);
    },

    "test ready": function () {
      v.sub.ready();

      assert.calledWith(v.send, 'Pa123');
    },

    "test Bart error": function () {
      v.sub.error(new core.Error(404, 'Not found'));

      assert.calledWith(v.send, 'Pa123|404|Not found');

      refute('a123' in v.conn._subs);
    },

    "test other error": function () {
      v.sub.error(new Error('Foo error'));

      assert.calledWith(v.send, 'Pa123|500|Error: Foo error');

      refute('a123' in v.conn._subs);
    },

    "test sendUpdate added": function () {
      var stub = v.conn.added = test.stub();
      v.sub.sendUpdate({constructor: {modelName: 'Foo'}, _id: 'id123', attributes: v.attrs = {name: 'John'}});

      assert.calledWith(stub, 'Foo', 'id123', v.attrs);
    },

    "test sendUpdate changed": function () {
      var stub = v.conn.changed = test.stub();
      v.sub.sendUpdate({constructor: {modelName: 'Foo'}, _id: 'id123', attributes: v.attrs = {name: 'John', age: 7}},
                      {age: 5});

      assert.calledWith(stub, 'Foo', 'id123', {age: 7});
    },

    "test sendUpdate removed": function () {
      var stub = v.conn.removed = test.stub();
      v.sub.sendUpdate(null, {constructor: {modelName: 'Foo'}, _id: 'id123', attributes: v.attrs = {name: 'John', age: 7}});

      assert.calledWith(stub, 'Foo', 'id123');
    },
  });
});
