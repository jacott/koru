define((require, exports, module)=>{
  const koru      = require('koru/main');
  const session   = require('koru/session');
  const TH        = require('koru/test-helper');
  const util      = require('koru/util');
  const message   = require('./message');
  const publishTH = require('./publish-test-helper-server');
  const scFactory = require('./server-connection-factory');

  const {stub, spy, onEnd, intercept, match: m} = TH;

  const publish   = require('./publish');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach( ()=>{
      v.pubFunc = stub(function () {
        v.lastSubscribedReceived = this.lastSubscribed;
      });
      publish({name: "foo", init(...args) {
        v.sub = this;
        v.pubFunc.apply(this, args);
      }});

      stub(util, 'dateNow').returns(Date.now());

      v.callSub = () => {
        v.conn =  publishTH.mockConnection();
        v.conn.sendBinary = stub();
        session._onMessage(v.conn, message.encodeMessage('P', [
          'a123', 'foo', [1,2,3], v.lastSubscribed
        ], session.globalDict));
      };

      v.callSub();
    });

    afterEach( ()=>{
      publish._destroy('foo');
      v = {};
    });

    test("unknown publication",  ()=>{
      intercept(koru, 'info');
      session._onMessage(
        v.conn = publishTH.mockConnection(),
        message.encodeMessage('P', ['a123', 'bar', [1,2,3]], session.globalDict));

      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'unknown publication: bar']);
      assert(v.conn.releaseMessages.calledAfter(v.conn.batchMessages));
    });

    test("session closing before subscribe",  ()=>{
      v.conn = publishTH.mockConnection();
      v.conn._subs = null; // no subscribes
      session._onMessage(
        v.conn,
        message.encodeMessage('P', ['a123', 'foo', [1,2,3]], session.globalDict));
      refute.called(v.conn.batchMessages);
    });

    test("publish",  ()=>{
      assert('a123' in v.conn._subs);

      assert.same(v.lastSubscribedReceived, 0);

      assert.calledWith(v.pubFunc, 1, 2, 3);

      assert.same(v.sub.lastSubscribed, util.dateNow());
      assert.same(v.sub.conn, v.conn);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 200, util.dateNow()]);
    });

    test("onStop",  ()=>{
      v.sub.onStop(v.onStop = stub());

      refute(v.sub.stopped);

      // "P", <pub-id>; no name means stop
      session._onMessage(v.conn, message.encodeMessage('P', ['a123'], session.globalDict));
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);

      session._onMessage(v.conn, message.encodeMessage('P', ['a123'], session.globalDict));
      assert.calledOnce(v.onStop);

      assert.calledWith(v.conn.sendBinary, 'P');
      assert.isTrue(v.sub.stopped);
    });

    test("stop",  ()=>{
      v.sub.onStop(v.onStop = stub());

      v.sub.stop();
      assert.called(v.onStop);
      refute('a123' in v.conn._subs);
      session._onMessage(v.conn, message.encodeMessage('P', ['a123'], session.globalDict));
      assert.calledOnce(v.onStop);

      assert.calledWith(v.conn.sendBinary, 'P', ['a123', false]);
    });

    test("when closed stop",  ()=>{
      v.sub.onStop(v.onStop = stub());
      v.sub.conn._subs = null;
      v.sub.conn.ws = null;

      v.sub.stop();
      assert.called(v.onStop);
    });

    test("setUserId",  ()=>{
      v.sub.setUserId('u456');
      assert.same(v.conn.userId, 'u456');
    });

    test("resubscribe",  ()=>{
      v.pubFunc = function (...args) {
        assert.same(this, v.sub);
        assert.equals(args, [1,2,3]);
        assert.isTrue(this.isResubscribe);
      };
      v.sub.onStop(v.onStop = function () {
        v.stopResub = this.isResubscribe;
      });

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);

      assert.isTrue(v.stopResub);
    });

    test("error on resubscribe",  ()=>{
      stub(koru, 'error');
      v.pubFunc = function () {
        throw new Error('foo error');
      };

      v.sub._stop = stub();

      v.sub.resubscribe();

      refute(v.sub.isResubscribe);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'Internal server error']);
      assert.calledWith(koru.error, TH.match(/foo error/));

      assert.calledTwice(v.sub._stop);
    });

    test("userId",  ()=>{
      v.conn.userId = 'foo';
      assert.same(v.sub.userId, 'foo');
    });

    test("Koru error",  ()=>{
      v.sub.error(new koru.Error(404, 'Not found'));

      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 404, 'Not found']);

      refute('a123' in v.conn._subs);
    });

    test("passing lastSubscribed", ()=>{
      v.lastSubscribed = 12345678;
      v.callSub();

      assert.same(v.lastSubscribedReceived, 12345678);
    });

    test("error on subscribe",  ()=>{
      v.pubFunc.reset();
      v.pubFunc = function () {
        this.error(new Error('Foo error'));
      };

      v.callSub();

      assert.calledOnce(v.conn.sendBinary);
      assert.calledWith(v.conn.sendBinary, 'P', ['a123', 500, 'Error: Foo error']);

      refute('a123' in v.conn._subs);
      assert(v.conn.releaseMessages.calledAfter(v.conn.batchMessages));
    });

    test("error when conn closed",  ()=>{
      v.pubFunc.reset();
      v.pubFunc = function () {
        this.id = null;
        this.conn._subs = null;
        this.error(new Error('Foo error'));
      };

      refute.exception(()=>{v.callSub()});
    });

    group("sendMatchUpdate", ()=>{
      beforeEach( ()=>{
        v.sub.match('Foo', v.m1 = doc => doc.attributes.name === 'John');
        v.docProto = {
          $withChanges(changes) {
            const old = util.deepCopy(this);
            Object.assign(old.attributes, changes);
            return old;
          },
          $asChanges: $asChanges,
          constructor: {modelName: 'Foo'}, _id: 'id123',
          attributes: v.attrs = {name: 'John', age: 5}};
      });

      test("stop",  ()=>{
        v.sub.match('Bar', v.m2 = stub());

        assert.equals(Object.keys(v.conn.match._models).sort(), ['Bar', 'Foo']);

        v.sub.stop();
        assert.equals(v.conn.match._models, {Foo: m.any, Bar: m.any});
        assert.equals(v.sub._matches, []);
      });

      test("added via add",  ()=>{
        const added = v.conn.added = stub();

        const doc = util.deepCopy(v.docProto);

        v.sub.sendMatchUpdate(doc, null, 'filter');

        assert.calledWith(added, 'Foo', 'id123', v.attrs, 'filter');
      });

      test("added via change",  ()=>{
        const added = v.conn.added = stub();

        const doc = util.deepCopy(v.docProto);
        const undo = {name: 'Sam'};

        v.sub.sendMatchUpdate(doc, undo);

        assert.calledWith(added, 'Foo', 'id123', v.attrs);
      });

      test("change",  ()=>{
        const changed= v.conn.changed = stub();

        const doc = util.deepCopy(v.docProto);
        const undo = {age: 7};

        v.sub.sendMatchUpdate(doc, undo, 'filter');

        assert.calledWith(changed, 'Foo', 'id123', {age: 5}, 'filter');
      });

      test("removed via change",  ()=>{
        const changed = v.conn.changed = stub();

        const doc = util.deepCopy(v.docProto);
        const undo = {name: 'John'};
        util.merge(doc.attributes, {name: 'Sam'});

        v.sub.sendMatchUpdate(doc, undo);

        assert.calledWith(changed, 'Foo', 'id123', {name: 'Sam'});
      });

      test("removed via remove",  ()=>{
        const removed = v.conn.removed = stub();

        const old = util.deepCopy(v.docProto);

        v.sub.sendMatchUpdate(null, old, old);

        assert.calledWith(removed, 'Foo', 'id123');
      });

      test("remove no match",  ()=>{
        const removed = v.conn.removed = stub();

        const old = util.deepCopy(v.docProto);
        util.merge(old.attributes, {name: 'Sam'});

        v.sub.sendMatchUpdate(null, old);

        refute.called(removed);
      });

      test("change no match",  ()=>{
        const changed = v.conn.changed = stub();

        const doc = util.deepCopy(v.docProto);
        doc.attributes.name = 'Sam';
        const undo = {age: 7};

        v.sub.sendMatchUpdate(doc, undo);

        refute.called(changed);
      });

      test("add no match",  ()=>{
        const added = v.conn.added = stub();

        const doc = util.deepCopy(v.docProto);
        doc.attributes.name = 'Sam';

        v.sub.sendMatchUpdate(doc);
        refute.called(added);
      });
    });

    test("sendUpdate added",  ()=>{
      const added = v.conn.added = stub();
      v.sub.sendUpdate({constructor: {modelName: 'Foo'}, _id: 'id123',
                        attributes: v.attrs = {name: 'John'}}, null, 'filter');

      assert.calledWith(added, 'Foo', 'id123', v.attrs, 'filter');
    });

    test("sendUpdate changed",  ()=>{
      const changed = v.conn.changed = stub();
      v.sub.sendUpdate({constructor: {modelName: 'Foo'}, _id: 'id123', $asChanges: $asChanges,
                        attributes: v.attrs = {name: 'John', age: 7}},
                       {age: 5}, 'filter');

      assert.calledWith(changed, 'Foo', 'id123', {age: 7}, 'filter');
    });

    test("sendUpdate removed",  ()=>{
      const removed = v.conn.removed = stub();
      v.sub.sendUpdate(null, {constructor: {modelName: 'Foo'}, _id: 'id123',
                              attributes: v.attrs = {name: 'John', age: 7}});

      assert.calledWith(removed, 'Foo', 'id123');
    });
  });

  function $asChanges(changes) {
    var attrs = this.attributes;
    var result = {};
    for(var key in changes) {
      result[key] = attrs[key];
    }
    return result;
  }
});
