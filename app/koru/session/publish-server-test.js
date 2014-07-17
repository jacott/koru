isServer && define(function (require, exports, module) {
  var test, v;
  var koru = require('../main');
  var TH = require('../test');
  var publish = require('./publish');
  var session = require('../session/base');
  var message = require('./message');
  var util = require('../util');
  var match = require('./match');

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
          match: match(),
          sendBinary: test.stub(),
          ws: {send: v.send = test.stub()},
          _subs: {},
        }, message.encodeMessage('P', ['a123', 'foo', [1,2,3]]));
      };

      v.callSub();
    },

    tearDown: function () {
      publish._destroy('foo');
      v = null;
    },

    "test unknown publication": function () {
      test.stub(koru, 'info');
      session._onMessage(v.conn = {
        sendBinary: test.stub(),
        _subs: {},
      }, message.encodeMessage('P', ['a123', 'bar', [1,2,3]]));

      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'unknown publication: bar']);
    },

    "test session closing before subscribe": function () {
      refute.exception(function () {
        session._onMessage(v.conn = {
          sendBinary: test.stub(),
          // no ws
          // no _subs
        }, message.encodeMessage('P', ['a123', 'foo', [1,2,3]]));
      });
    },

    "test publish": function () {
      assert('a123' in v.conn._subs);

      assert.calledWith(v.pubFunc, 1, 2, 3);

      assert.same(v.sub.conn, v.conn);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123']);
    },

    "test onStop": function () {
      v.sub.onStop(v.onStop = test.stub());

      // "P", <pub-id>; no name means stop
      session._onMessage(v.conn, message.encodeMessage('P', ['a123']));
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, message.encodeMessage('P', ['a123']));
      assert.calledOnce(v.onStop);
    },

    "test stop": function () {
      v.sub.onStop(v.onStop = test.stub());

      v.sub.stop();
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, message.encodeMessage('P', ['a123']));
      assert.calledOnce(v.onStop);
    },

    "test when closed stop": function () {
      v.sub.onStop(v.onStop = test.stub());
      v.sub.conn._subs = null;
      v.sub.conn.ws = null;

      v.sub.stop();
      assert.called(v.onStop);
    },

    "test setUserId": function () {
      v.sub.setUserId('u456');
      assert.same(v.conn.userId, 'u456');
    },

    "test resubscribe": function () {
      v.pubFunc = function () {
        assert.same(this, v.sub);
        assert.equals(koru.util.slice(arguments), [1,2,3]);
        assert.isTrue(this.isResubscribe);
      };
      v.sub.onStop(v.onStop = function () {
        v.stopResub = this.isResubscribe;
      });

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);

      assert.isTrue(v.stopResub);
    },

    "test error on resubscribe": function () {
      test.stub(koru, 'info');
      v.pubFunc = function () {
        throw new Error('foo error');
      };

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'Error: foo error']);
      assert.calledWith(koru.info, TH.match(/foo error/));
    },

    "test userId": function () {
      v.conn.userId = 'foo';
      assert.same(v.sub.userId, 'foo');
    },

    "test Koru error": function () {
      v.sub.error(new koru.Error(404, 'Not found'));

      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 404, 'Not found']);

      refute('a123' in v.conn._subs);
    },

    "test error": function () {
      v.pubFunc.reset();
      v.pubFunc = function () {
        this.error(new Error('Foo error'));
      };

      v.callSub();

      assert.calledOnce(v.conn.sendBinary);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'Error: Foo error']);

      refute('a123' in v.conn._subs);
    },

    "sendMatchUpdate": {
      setUp: function () {
        v.sub.match('Foo', v.m1 = function (doc) {
          return doc.attributes.name === 'John';
        });
        v.docProto = {
          $asBefore: function (changes) {
            var old = util.deepCopy(this);
            util.extend(old.attributes, changes);
            return old;
          },
          constructor: {modelName: 'Foo'}, _id: 'id123', attributes: v.attrs = {name: 'John', age: 5}};
      },

      "test stop": function () {
        v.sub.match('Bar', v.m2 = test.stub());

        assert.equals(Object.keys(v.conn.match._models).sort(), ['Bar', 'Foo']);

        v.sub.stop();
        assert.equals(Object.keys(v.conn.match._models), []);
        assert.equals(v.sub._matches, []);
      },

      "test added via add": function () {
        var stub = v.conn.added = test.stub();

        var doc = util.deepCopy(v.docProto);

        v.sub.sendMatchUpdate(doc);

        assert.calledWith(stub, 'Foo', 'id123', v.attrs);
      },

      "test added via change": function () {
        var stub = v.conn.added = test.stub();

        var doc = util.deepCopy(v.docProto);
        var was = {name: 'Sam'};

        v.sub.sendMatchUpdate(doc, was);

        assert.calledWith(stub, 'Foo', 'id123', v.attrs);
      },

      "test change": function () {
        var stub = v.conn.changed = test.stub();

        var doc = util.deepCopy(v.docProto);
        var was = {age: 7};

        v.sub.sendMatchUpdate(doc, was);

        assert.calledWith(stub, 'Foo', 'id123', {age: 5});
      },

      "test removed via change": function () {
        var stub = v.conn.removed = test.stub();

        var doc = util.deepCopy(v.docProto);
        var was = {name: 'John'};
        util.extend(doc.attributes, {name: 'Sam'});

        v.sub.sendMatchUpdate(doc, was);

        assert.calledWith(stub, 'Foo', 'id123');
      },

      "test removed via remove": function () {
        var stub = v.conn.removed = test.stub();

        var old = util.deepCopy(v.docProto);

        v.sub.sendMatchUpdate(null, old, old);

        assert.calledWith(stub, 'Foo', 'id123');
      },

      "test remove no match": function () {
        var stub = v.conn.removed = test.stub();

        var old = util.deepCopy(v.docProto);
        util.extend(old.attributes, {name: 'Sam'});

        v.sub.sendMatchUpdate(null, old);

        refute.called(stub);
      },

      "test change no match": function () {
        var stub = v.conn.changed = test.stub();

        var doc = util.deepCopy(v.docProto);
        doc.attributes.name = 'Sam';
        var was = {age: 7};

        v.sub.sendMatchUpdate(doc, was);

        refute.called(stub);
      },

      "test add no match": function () {
        var stub = v.conn.added = test.stub();

        var doc = util.deepCopy(v.docProto);
        doc.attributes.name = 'Sam';

        v.sub.sendMatchUpdate(doc);
        refute.called(stub);
      },
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
