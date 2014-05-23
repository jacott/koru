isServer && define(function (require, exports, module) {
  var test, v;
  var bt = require('../test');
  var session = require('../session/server-main');
  var Connection = require('./server-connection');
  var env = require('../env');

  bt.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.conn = new Connection(v.ws = {send: test.stub()}, 123);

    },

    tearDown: function () {
      v = null;
    },

    "test added": function () {
      v.conn.added('Foo', '123', v.attrs = {name: 'bar', age: 5});

      assert.calledWith(v.ws.send, 'AFoo|123'+JSON.stringify(v.attrs), env.nullFunc);
    },

    "test changed": function () {
      v.conn.changed('Foo', '123', v.attrs = {name: 'bar'});

      assert.calledWith(v.ws.send, 'CFoo|123'+JSON.stringify(v.attrs), env.nullFunc);
    },

    "test removed": function () {
      v.conn.removed('Foo', '123');

      assert.calledWith(v.ws.send, 'RFoo|123', env.nullFunc);
    },
  });
});
