isServer && define((require, exports, module) => {
  'use strict';
  /**
   * ServerConnection is the server side of a client-server webSocket connection.
   */
  const koru            = require('koru');
  const IdleCheck       = require('koru/idle-check').singleton;
  const DocChange       = require('koru/model/doc-change');
  const TransQueue      = require('koru/model/trans-queue');
  const MockDB          = require('koru/pubsub/mock-db');
  const baseSession     = require('koru/session');
  const ConnTH          = require('koru/session/conn-th-server');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const message         = require('./message');

  const crypto = requirejs.nodeRequire('crypto');

  const {stub, spy, intercept, match: m, stubProperty} = TH;

  const session = new (baseSession.constructor)('testServerConnection');

  const ServerConnection = require('./server-connection');

  let v = {};
  TH.testCase(module, ({before, beforeEach, afterEach, group, test}) => {
    let conn;
    beforeEach(() => {
      conn = v.conn = new ServerConnection(
        session,
        v.ws = {send: stub(), close: stub(), on: stub()},
        {},
        123,
        v.sessClose = stub(),
      );
      stub(v.conn, 'sendBinary');
      intercept(session, 'execWrapper', (func, conn) => {
        const thread = util.thread;
        thread.userId = conn.userId;
        thread.connection = conn;
        func(conn);
      });
      session.globalDict = baseSession.globalDict;
    });

    afterEach(() => {
      v = {};
    });

    group('onMessage', () => {
      beforeEach(() => {
        v.tStub = stub();
        session.provide(
          't',
          v.tFunc = function (...args) {
            v.tStub.apply(this, args);
          },
        );
        v.thread = {};
        TH.stubProperty(util, 'thread', {
          get() {
            return v.thread;
          },
        });
      });

      afterEach(() => {
        delete session._commands.t;
      });

      test('heartbeat response', () => {
        const now = Date.now();
        intercept(Date, 'now', () => now);

        v.conn.onMessage('H junk');

        assert.calledWith(v.ws.send, 'K' + now);
      });

      test('waitIdle', () => {
        TH.noInfo();
        spy(IdleCheck, 'inc');
        spy(IdleCheck, 'dec');
        stub(koru, 'error');
        let success = false, err;
        stub(session, '_onMessage', (conn) => {
          if (!success) {
            try {
              assert.calledOnce(IdleCheck.inc);
              refute.called(IdleCheck.dec);
              v.conn.onMessage('t456');
            } catch (ex) {
              err = ex;
              return;
            }
            success = true;
          }
          throw new Error('I can handle this');
        });
        v.conn.onMessage('t123');
        if (err) throw err;
        assert.calledTwice(IdleCheck.inc);
        assert.calledTwice(IdleCheck.dec);
        assert(success);
      });

      test('thread vars', async () => {
        v.tStub = () => {
          v.threadUserId = util.thread.userId;
          v.threadConnection = util.thread.connection;
        };

        await v.conn.setUserId('tcuid');

        v.conn.onMessage('t123');

        assert.same(v.thread.connection, v.conn);
        assert.same(v.thread.userId, 'tcuid');
      });

      test('queued', async () => {
        v.calls = [];
        let error;
        let token = 'first';
        session.execWrapper.restore();
        intercept(session, 'execWrapper', (func, conn) => {
          v.calls.push(token);
          return func(conn);
        });
        intercept(session, '_onMessage', async (conn, data) => {
          token = 'second';
          try {
            v.calls.push(data);
            switch (data) {
              case 't123':
                assert.equals(v.conn._last, ['t123', null]);
                await v.conn.onMessage('t456');
                assert.equals(v.conn._last, ['t456', null]);
                assert.equals(v.calls, ['first', 't123']);
                break;
              case 't456':
                assert.equals(v.conn._last, ['t456', null]);
                break;
            }
          } catch (ex) {
            error = error || ex;
          }
        });
        await v.conn.onMessage('t123');

        if (error) throw error;

        assert.equals(v.calls, ['first', 't123', 'second', 't456']);
        assert.equals(v.conn._last, null);
      });
    });

    test('sendEncoded', () => {
      /**
       * Send a pre encoded binary {#../message} to the client.
       */
      api.protoMethod();
      //[
      conn.sendEncoded('myMessage');
      assert.calledWith(conn.ws.send, 'myMessage', {binary: true});
      //]
      const error = new Error('an error');
      conn.ws.send.throws(error);

      stub(koru, 'info');
      conn.sendEncoded('got error');
      assert.same(conn.ws, null);
      assert.calledWith(koru.info, 'Websocket exception for connection: 123', error);
    });

    test('send', () => {
      /**
       * Send a text message to the client.
       *
       * @param type the one character type for the message. See {#../base#provide}.

       * @param data the text message to send.
       **/
      api.protoMethod();
      //[
      conn.send('X', 'FOO');
      assert.calledWith(v.ws.send, 'XFOO');
      //]

      stub(koru, 'info');
      refute.exception(() => {
        conn.ws.send = stub().throws(v.error = new Error('foo'));
        conn.send('X', 'FOO');
      });

      assert.called(v.sessClose);
      assert.called(koru.info);

      v.sessClose.reset();
      koru.info.reset();
      conn.ws = null;
      refute.exception(() => {
        conn.send('X', 'FOO');
      });

      refute.called(v.sessClose);
      refute.called(koru.info);
    });

    test('sendBinary', () => {
      /**
       * Send a object to client as a binary message.

       * @param type the one character type for the message. See {#../base#provide}.

       * @param {any-type} data a object or primitive to encode and send as a binary message.
       **/
      api.protoMethod();
      const {conn} = v;
      conn.sendBinary.restore();
      //[
      conn.sendBinary('M', [1, 2, 3]);
      //]

      assert.calledWith(
        v.ws.send,
        m((data) => {
          assert.same(data[0], 'M'.charCodeAt(0));
          assert.equals(message.decodeMessage(data.subarray(1)), [1, 2, 3]);
          return true;
        }, {binary: true, mask: true}),
      );

      stub(koru, 'info');
      refute.exception(() => {
        conn.ws.send = stub().throws(v.error = new Error('foo'));
        conn.sendBinary('X', ['FOO']);
      });

      assert.called(koru.info);

      koru.info.reset();
      conn.ws = null;
      refute.exception(() => {
        conn.sendBinary('X', ['FOO']);
      });

      refute.called(koru.info);

      conn.ws = {send: stub()};
      conn.sendBinary('OneArg');
      assert.calledWith(conn.ws.send, 'OneArg', {binary: true});
    });

    test('batchMessage', () => {
      /**
       * Batch a binary message and send once current transaction completes successfully. The
       * message is encoded immediately.

       * @param type the one character type for the message. See {#../base#provide}.

       * @param data a object or primitive to encode and send as a binary message.
       **/
      api.protoMethod();
      const {conn} = v;
      stub(conn, 'sendEncoded');
      let finished = false;
      //[
      TransQueue.transaction(() => {
        conn.batchMessage('R', ['Foo', {_id: 'foo1'}]);
        conn.batchMessage('R', ['Foo', {_id: 'foo2'}]);
        koru.runFiber(() => {
          TransQueue.transaction(() => {
            conn.batchMessage('R', ['Bar', {_id: 'bar1'}]);
          });
        });
        koru.runFiber(() => {
          try {
            TransQueue.transaction(() => {
              conn.batchMessage('R', ['Nat', {_id: 'nat1'}]);
              throw 'abort';
            });
          } catch (ex) {
            if (ex !== 'abort') throw ex; //]
            finished = true; //[#
          }
        });
      });
      assert.calledTwice(conn.sendEncoded);
      assert.encodedCall(conn, 'R', ['Foo', {_id: 'foo1'}]);
      assert.encodedCall(conn, 'R', ['Foo', {_id: 'foo2'}]);

      assert.encodedCall(conn, 'R', ['Bar', {_id: 'bar1'}]);
      refute.encodedCall(conn, 'R', ['Nat', {_id: 'nat1'}]);
      //]
      assert.isTrue(finished);

      conn.sendEncoded.reset();
      try {
        TransQueue.transaction(() => {
          conn.batchMessage('R', ['Foo', {_id: 'foo1'}]);
          conn.batchMessage('R', ['Foo', {_id: 'foo2'}]);
          throw 'abort';
        });
      } catch (e) {
        if (e !== 'abort') throw e;
      }
      refute.called(conn.sendEncoded);

      assert.exception(() => {
        conn.batchMessage('R', ['Foo', {_id: 'foo1'}]);
      }, {message: 'batchMessage called when not in transaction'});
    });

    test('when closed sendBinary', () => {
      conn.ws = null;
      conn.sendBinary.restore();
      refute.exception(() => conn.sendBinary('M', [1, 2, 3]));
    });

    test('setUserId', async () => {
      const conn = new ServerConnection(session, v.ws, {}, 888, v.sessClose = stub());
      await conn.setUserId('u456');
      assert.same(conn.userId, 'u456');

      await conn.setUserId(null);
      assert.same(conn.userId, undefined);
    });

    test('setUserId and DEFAULT_USER_ID', async () => {
      stubProperty(session, 'DEFAULT_USER_ID', {value: 'public'});
      const conn = new ServerConnection(session, v.ws, {}, 888, v.sessClose = stub());
      stub(crypto, 'randomBytes').yields(null, {
        toString: stub().withArgs('base64').returns('crypto64Id=='),
      });
      const sendUid = v.ws.send.withArgs('VSu456:888|crypto64Id:default');
      const sendUidCompleted = v.ws.send.withArgs('VC');
      conn._subs = {s1: {userIdChanged: v.s1 = stub()}, s2: {userIdChanged: v.s2 = stub()}};

      await conn.setUserId('u456');

      assert.same(util.thread.userId, 'u456');
      assert.same(conn.userId, 'u456');

      assert.calledWith(v.s1, 'u456', 'public');
      assert.called(v.s2);

      assert.calledWith(crypto.randomBytes, 36);
      assert.calledWith(v.ws.send, 'VSu456:888|crypto64Id:default');
      assert.same(conn.sessAuth, '888|crypto64Id');

      assert(sendUid.calledBefore(v.s1));
      assert(sendUidCompleted.calledAfter(v.s2));

      await conn.setUserId(null);

      assert.same(util.thread.userId, 'public');
      assert.calledWith(v.s1, 'public', 'u456');
    });

    test('filterDoc', () => {
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
        _id: 'book1',
        constructor: {modelName: 'Book'},
        other: 123,
        attributes: {name: 'The little yellow digger', wholesalePrice: 1095},
      };

      const filteredDoc = ServerConnection.filterDoc(doc, {wholesalePrice: true});
      assert.equals(filteredDoc, {
        _id: 'book1',
        constructor: {modelName: 'Book'},
        attributes: {name: 'The little yellow digger'},
      });
      //]
    });

    test('buildUpdate', async () => {
      /**
       * BuildUpdate converts a {#koru/model/doc-change} object into a update command to send to
       * clients.

       * @param dc for the document that has been updated

       * @returns an update command. Where
       *
       * |index 0|index 1|
       * |-------|-------|
       * |`A`    |`[modelName, doc._id, doc.attributes]|
       * |`C`    |`[modelName, doc._id, dc.changes]|
       * |`R`    |`[modelName, doc._id]|
       **/
      api.method();
      const db = new MockDB(['Book']);
      const {Book} = db.models;
      const book1 = await Book.create();

      //[
      assert.equals(ServerConnection.buildUpdate(DocChange.add(book1)), ['A', ['Book', {
        _id: 'book1',
        name: 'Book 1',
      }]]);
      //]
      book1.attributes.name = 'new name'; //[#
      assert.equals(ServerConnection.buildUpdate(DocChange.change(book1, {name: 'old name'})), [
        'C',
        ['Book', 'book1', {name: 'new name'}],
      ]);

      assert.equals(ServerConnection.buildUpdate(DocChange.delete(book1)), ['R', [
        'Book',
        'book1',
        undefined,
      ]]);

      assert.equals(ServerConnection.buildUpdate(DocChange.delete(book1, 'stopped')), ['R', [
        'Book',
        'book1',
        'stopped',
      ]]);
      //]
    });

    test('added', () => {
      /**
       * Send a document added message to client with an optional attribute remove filter
       */
      api.protoMethod();
      //[
      const book = {_id: 'id123', title: '1984', published: 1948};
      conn.added('Book', book);

      assert.calledWith(conn.sendBinary, 'A', ['Book', book]);

      conn.added('Book', book, {published: true});

      assert.calledWith(conn.sendBinary, 'A', ['Book', {_id: 'id123', title: '1984'}]);
      //]
    });

    test('changed', () => {
      /**
       * Send a document changed message to client with an optional attribute remove filter.
       */
      api.protoMethod();
      //[
      conn.changed('Book', 'id123', {title: '1984'});

      assert.calledWith(conn.sendBinary, 'C', ['Book', 'id123', {title: '1984'}]);

      conn.changed('Book', 'id123', {title: '1984', published: 1948}, {published: true});

      assert.calledWith(conn.sendBinary, 'C', ['Book', 'id123', {title: '1984'}]);
      //]
    });

    group('removed', () => {
      /**
       * Send a document removed message to client
       */
      beforeEach(() => {
        api.protoMethod();
      });

      test('removed noarg', () => {
        //[
        conn.removed('Book', 'id123');

        assert.calledWith(conn.sendBinary, 'R', ['Book', 'id123', undefined]);
        //]
      });

      test('removed stopped', () => {
        //[
        conn.removed('Book', 'id123', 'stopped');

        assert.calledWith(conn.sendBinary, 'R', ['Book', 'id123', 'stopped']);
        //]
      });
    });

    test('closed', () => {
      conn.onClose(v.close1 = stub());
      conn.onClose(v.close2 = stub());
      conn._subs.t1 = {stop: v.t1 = stub()};
      conn._subs.t2 = {stop: v.t2 = stub()};

      conn.close();

      assert.calledWith(v.close1, conn);
      assert.calledWith(v.close2, conn);

      assert.called(v.t1);
      assert.called(v.t2);

      assert.isNull(conn._subs);
      assert.isNull(conn.ws);

      conn.close();

      assert.calledOnce(v.t1);
    });
  });
});
