isServer && define((require, exports, module)=>{
  /**
   * ServerConnection is the server side of a client-server webSocket connection.
   **/
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const DocChange       = require('koru/model/doc-change');
  const baseSession     = require('koru/session');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const match           = require('./match');
  const message         = require('./message');

  const crypto      = requirejs.nodeRequire('crypto');

  const {stub, spy, onEnd, intercept} = TH;

  const session = new (baseSession.constructor)('testServerConnection');

  const ServerConnection = require('./server-connection');

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.conn = new ServerConnection(session, v.ws = {
        send: stub(), close: stub(), on: stub(),
      }, {}, 123, v.sessClose = stub());
      stub(v.conn, 'sendBinary');
      intercept(session, 'execWrapper', function (func, conn) {
        const thread = util.thread;
        thread.userId = conn.userId;
        thread.connection = conn;
        func(conn);
      });
      session.globalDict = baseSession.globalDict;
    });

    afterEach(()=>{
      v = {};
    });

    group("onMessage", ()=>{
      beforeEach(()=>{
        v.tStub = stub();
        session.provide('t', v.tFunc = function (...args) {
          v.tStub.apply(this, args);
        });
        v.thread = {};
        TH.stubProperty(util, 'thread', {get() {return v.thread}});
      });

      afterEach(()=>{
        delete session._commands.t;
      });

      test("heartbeat response", ()=>{
        const now = Date.now();
        intercept(Date, 'now', ()=>now);

        v.conn.onMessage('H junk');

        assert.calledWith(v.ws.send, 'K'+now);
      });

      test("waitIdle", ()=>{
        spy(IdleCheck, 'inc');
        spy(IdleCheck, 'dec');
        stub(koru, 'error');
        stub(session, '_onMessage', function (conn) {
          assert.called(IdleCheck.inc);
          refute.called(IdleCheck.dec);
          v.success = true;
          v.conn.onMessage('t456');
          throw new Error("I can handle this");
        });
        v.conn.onMessage('t123');
        assert.called(IdleCheck.inc);
        assert.called(IdleCheck.dec);
        assert(v.success);
      });

      test("thread vars", ()=>{
        v.tStub = function () {
          v.threadUserId = util.thread.userId;
          v.threadConnection = util.thread.connection;
        };

        v.conn.userId = 'tcuid';

        v.conn.onMessage('t123');

        assert.same(v.thread.connection, v.conn);
        assert.same(v.thread.userId, 'tcuid');
      });

      test("queued", ()=>{
        v.calls = [];
        let error;
        let token = 'first';
        session.execWrapper.restore();
        intercept(session, 'execWrapper', function (func, conn) {
          v.calls.push(token);
          func(conn);
        });
        intercept(session, '_onMessage', function (conn, data) {
          token = 'second';
          try {
            v.calls.push(data);
            switch(data) {
            case 't123':
              assert.equals(v.conn._last, ['t123', null]);
              v.conn.onMessage('t456');
              assert.equals(v.conn._last, ['t456', null]);
              assert.equals(v.calls, ['first', 't123']);
              break;
            case 't456':
              assert.equals(v.conn._last, ['t456', null]);
              break;
            }
          } catch(ex) {
            error = error || ex;
          }
        });
        v.conn.onMessage('t123');

        if (error) throw error;

        assert.equals(v.calls, ['first', 't123', 'second', 't456']);
        assert.equals(v.conn._last, null);
      });
    });

    test("send batched", ()=>{
      const bm = util.thread.batchMessage = {batch: stub()};
      onEnd(() => util.thread.batchMessage = undefined);

      v.conn.sendBinary.restore();

      v.conn.sendBinary('M', [1, 2, 3], v.func = stub());

      assert.calledWith(bm.batch, v.conn, 'M', [1, 2, 3], v.func);

      refute.called(v.conn.ws.send);
    });

    test("message ordering", ()=>{
      v.conn.sendBinary.restore();
      v.thread = v.c2t = {name: 'c2'};
      TH.stubProperty(util, 'thread', {get() {return v.thread}});
      v.conn2 = new ServerConnection(session, v.ws = {
        send: stub(), close: stub(), on: stub(),
      }, {}, 456, v.sessClose = stub());

      const bm2 = v.conn2.batchMessages();
      spy(bm2, 'batch');
      v.conn2.sendBinary('A', 1);
      assert.calledWith(bm2.batch, v.conn2, 'A', 1);
      v.thread = v.ct = {name: 'c'};
      v.conn2.sendBinary('C', 2);
      const bm = v.conn.batchMessages();

      v.conn.sendBinary('A', 11);
      v.conn2.sendBinary('C', 3);
      v.thread = v.c2t;
      v.conn2.sendBinary('A', 4);
      v.thread = v.ct;
      v.conn2.sendBinary('C', 5);

      stub(message, 'encodeMessage');
      const aEncode = message.encodeMessage.withArgs('A');
      const wEncode = message.encodeMessage.withArgs('W');

      v.conn.releaseMessages();
      assert.calledWith(aEncode, 'A', 11);

      v.thread = v.c2t;
      v.conn2.releaseMessages();

      assert.calledWith(wEncode, 'W', [
        ['A', 1],
        ['A', 4],
        ['C', 2], ['C', 3],
        ['C', 5],
      ], session.globalDict);
      assert(wEncode.calledAfter(aEncode));
    });

    test("sendEncoded", ()=>{
      /**
       * Send a pre encoded binary {#../message} to the client.
       **/
      api.protoMethod();
      //[
      v.conn.sendEncoded("myMessage");
      assert.calledWith(v.conn.ws.send, 'myMessage', {binary: true});
      //]
      const error = new Error("an error");
      v.conn.ws.send.throws(error);

      stub(koru, 'info');
      v.conn.sendEncoded("got error");
      assert.same(v.conn.ws, null);
      assert.calledWith(koru.info, 'Websocket exception for connection: 123', error);
    });

    test("message abort", ()=>{
      v.conn.sendBinary.restore();
      v.thread = v.ct = {name: 'c'};
      TH.stubProperty(util, 'thread', {get() {return v.thread}});

      const bm = v.conn.batchMessages();
      v.conn.sendBinary('C', 6);
      v.thread = v.c2t = {name: 'c2'};
      v.conn.sendBinary('C', 5);
      v.conn.sendBinary('C', 4);
      v.thread = v.ct;
      v.conn.sendBinary('C', 7);

       stub(message, 'encodeMessage');
      v.conn.abortMessages();
      assert.calledOnceWith(message.encodeMessage, 'W', [['C', 5], ['C', 4]]);
    });


    test("send", ()=>{
      /**
       * Send a text message to the client
       *
       * @param type the one character type for the message. See {#../base#provide}.

       * @param data the text message to send.
       **/
      api.protoMethod();
      //[
      v.conn.send('X', 'FOO');
      assert.calledWith(v.ws.send, 'XFOO');
      //]

      stub(koru, 'info');
      refute.exception(function () {
        v.conn.ws.send = stub().throws(v.error = new Error('foo'));
        v.conn.send('X', 'FOO');
      });

      assert.called(v.sessClose);
      assert.called(koru.info);

      v.sessClose.reset();
      koru.info.reset();
      v.conn.ws = null;
      refute.exception(function () {
        v.conn.send('X', 'FOO');
      });

      refute.called(v.sessClose);
      refute.called(koru.info);
    });

    test("sendBinary", ()=>{
      v.conn.sendBinary.restore();
      v.conn.sendBinary('M', [1,2,3]);

      assert.calledWith(v.ws.send, TH.match(function (data) {
        assert.same(data[0], 'M'.charCodeAt(0));
        assert.equals(message.decodeMessage(data.subarray(1)), [1,2,3]);
        return true;
      }, {binary: true, mask: true}));

      stub(koru, 'info');
      refute.exception(function () {
        v.conn.ws.send = stub().throws(v.error = new Error('foo'));
        v.conn.sendBinary('X', ['FOO']);
      });

      assert.called(koru.info);

      koru.info.reset();
      v.conn.ws = null;
      refute.exception(function () {
        v.conn.sendBinary('X', ['FOO']);
      });

      refute.called(koru.info);

      v.conn.ws = {send: stub()};
      v.conn.sendBinary('OneArg');
      assert.calledWith(v.conn.ws.send, 'OneArg', {binary: true});
    });

    test("when closed sendBinary", ()=>{
      v.conn.ws = null;
      v.conn.sendBinary.restore();
      refute.exception(() => v.conn.sendBinary('M', [1,2,3]));
    });

    test("set userId", ()=>{
      stub(crypto, 'randomBytes').yields(null, {
        toString: stub().withArgs('base64').returns('crypto64Id==')});
      const sendUid = v.ws.send.withArgs('VSu456:123|crypto64Id');
      const sendUidCompleted = v.ws.send.withArgs('VC');
      v.conn._subs = {s1: {userIdChanged: v.s1 = stub()}, s2: {userIdChanged: v.s2 = stub()}};

      v.conn.userId = 'u456';

      assert.same(util.thread.userId, 'u456');
      assert.same(v.conn.userId, 'u456');

      assert.calledWith(v.s1, 'u456', void 0);
      assert.called(v.s2);

      assert.calledWith(crypto.randomBytes, 36);
      assert.calledWith(v.ws.send, 'VSu456:123|crypto64Id');
      assert.same(v.conn.sessAuth, '123|crypto64Id');

      assert(sendUid.calledBefore(v.s1));
      assert(sendUidCompleted.calledAfter(v.s2));
    });

    test("filterDoc", ()=>{
      /**
       * Filter out attributes from a doc. The filtered attributes are shallow copied.
       *
       * @param doc the document to be filtered.

       * @param filter an Object who properties will override the document.

       * @return an object suitable for sending to client; namely it has an `_id`, a `constructor`
       * model, and a `attributes` field.
       **/
      api.method();
      //[
      const doc = {
        _id: 'book1', constructor: {modelName: 'Book'}, other: 123,
        attributes: {name: 'The little yellow digger', wholesalePrice: 1095}
      };

      const filteredDoc = ServerConnection.filterDoc(doc, {wholesalePrice: true});
      assert.equals(filteredDoc, {
        _id: 'book1',
        constructor: {modelName: 'Book'},
        attributes: {name: 'The little yellow digger'}
      });
      //]
    });

    test("added", ()=>{
      v.conn.added('Foo', '123', v.attrs = {name: 'bar', age: 5});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', v.attrs]);

      v.conn.added('Foo', '123', v.attrs = {name: 'fbar', age: 5}, {age: 1});

      assert.calledWith(v.conn.sendBinary, 'A', ['Foo', '123', {name: 'fbar'}]);
    });

    test("changed", ()=>{
      v.conn.changed('Foo', '123', v.attrs = {name: 'bar'});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', v.attrs]);

      v.conn.changed('Foo', '123', v.attrs = {name: 'fbar', age: 2}, {name: 1});

      assert.calledWith(v.conn.sendBinary, 'C', ['Foo', '123', {age: 2}]);
    });

    test("removed", ()=>{
      v.conn.removed('Foo', '123');

      assert.calledWith(v.conn.sendBinary, 'R', ['Foo', '123']);
    });

    test("closed", ()=>{
      v.conn.onClose(v.close1 = stub());
      v.conn.onClose(v.close2 = stub());
      v.conn._subs.t1 = {stop: v.t1 = stub()};
      v.conn._subs.t2 = {stop: v.t2 = stub()};

      v.conn.close();

      assert.calledWith(v.close1, v.conn);
      assert.calledWith(v.close2, v.conn);

      assert.called(v.t1);
      assert.called(v.t2);

      assert.isNull(v.conn._subs);
      assert.isNull(v.conn.ws);

      v.conn.close();

      assert.calledOnce(v.t1);
    });
  });
});
