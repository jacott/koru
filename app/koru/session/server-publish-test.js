isServer && define(function (require, exports, module) {
  var test, v;
  var env = require('../env');
  var TH = require('../test');
  var publish = require('./publish');
  var session = require('../session/server-main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.pubFunc = test.stub();
      publish("foo", function () {
        v.sub = this;
        v.pubFunc.apply(this, arguments);
      });

      v.callSub = function () {
        session._onMessage(v.conn = {
          ws: {send: v.send = test.stub()},
          _subs: {},
        }, 'Pfoo|a123'+JSON.stringify([1,2,3]));
      };

      v.callSub();
    },

    tearDown: function () {
      publish._destroy('foo');
      v = null;
    },

    "test unknown publication": function () {
      test.stub(env, 'info');
      session._onMessage(v.conn = {
        ws: {send: v.send = test.stub()},
        _subs: {},
      }, 'Pbar|a123'+JSON.stringify([1,2,3]));

      assert.calledWith(v.send, 'Pa123|500|unknown publication: bar');
    },

    "test publish": function () {
      assert('a123' in v.conn._subs);

      assert.calledWith(v.pubFunc, 1, 2, 3);

      assert.same(v.sub.conn, v.conn);
      assert.calledWith(v.send, 'Pa123');
    },

    "test onStop": function () {
      v.sub.onStop(v.onStop = test.stub());

      // "P<name>|<pub-id>"; no name means stop
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

    "test setUserId": function () {
      v.sub.setUserId('u456');
      assert.same(v.conn.userId, 'u456');
    },

    "test resubscribe": function () {
      v.pubFunc.reset();
      v.sub.onStop(v.onStop = test.stub());

      v.sub.resubscribe();

      assert.calledWith(v.pubFunc, 1, 2, 3);
      assert.same(v.pubFunc.thisValues[0], v.sub);
      assert.called(v.onStop);
    },

    "test error on resubscribe": function () {
      test.stub(env, 'error');
      v.pubFunc = function () {
        throw new Error('foo error');
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
      assert.calledWith(v.send, 'Pa123|500|Internal server error');
      assert.calledWith(env.error, TH.match(/foo error/));
    },

    "test userId": function () {
      v.conn.userId = 'foo';
      assert.same(v.sub.userId, 'foo');
    },

    "test Koru error": function () {
      v.sub.error(new env.Error(404, 'Not found'));

      assert.calledWith(v.send, 'Pa123|404|Not found');

      refute('a123' in v.conn._subs);
    },

    "test error": function () {
      v.pubFunc.reset();
      v.pubFunc = function () {
        this.error(new Error('Foo error'));
      };

      v.callSub();

      assert.calledOnce(v.send);
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
