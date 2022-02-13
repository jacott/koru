define((require, exports, module) => {
  'use strict';
  /**
   * A Helper for Publication tests.
   *
   **/
  const MockDB          = require('koru/pubsub/mock-db');
  const Publication     = require('koru/pubsub/publication');
  const Union           = require('koru/pubsub/union');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, intercept} = TH;

  const ConnTH = require('koru/session/conn-th-server');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    before(() => {
      api.module({subjectName: 'ConnTH'});
    });

    test('mockConnection', async () => {
      /**
       * Create a connection useful for testing publications.
       **/
      api.method();
      //[
      const conn = ConnTH.mockConnection('sess123');
      class Library extends Publication {
      }
      Library.pubName = 'Library';

      const sub1 = await conn.onSubscribe('sub1', 1, 'Library');
      after(() => {ConnTH.stopAllSubs(conn)});

      assert.same(sub1.conn, conn);
      //]
    });

    test('stopAllSubs', async () => {
      /**
       * Stop all stubs for a connection. Useful in test teardown to ensure observers have stopped.
       **/
      api.method();
      //[
      const conn = ConnTH.mockConnection('sess123');
      class Library extends Publication {
      }
      Library.pubName = 'Library';

      const sub1 = await conn.onSubscribe('sub1', 1, 'Library');
      const stop = spy(sub1, 'stop');

      ConnTH.stopAllSubs(conn);

      assert.called(stop);
      //]
    });

    test('decodeEncodedCall', async () => {
      /**
       * convert an encoded call back to objects
       **/
      api.method();
      const db = new MockDB(['Book']);

      const {Book} = db.models;
      //[
      const conn = ConnTH.mockConnection();
      const book1 = await Book.create();
      const book2 = await Book.create();

      class MyUnion extends Union {
        async loadInitial(encoder, discreteLastSubscribed) {
          await Book.query.forEach((doc) => {encoder.addDoc(doc)});
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      await union.addSub(sub);

      assert.equals(ConnTH.decodeEncodedCall(conn, conn.sendEncoded.firstCall), {
        type: 'W',
        data: [
          ['A', ['Book', {_id: 'book1', name: 'Book 1'}]],
          ['A', ['Book', {_id: 'book2', name: 'Book 2'}]],
        ]});
      //]
    });

    test('assert.encodedCall', async () => {
      /**
       * `assert.encodedCall` can be used for determining if a {#../union} batchUpdate was called.
       **/
      intercept(assert, 'encodedCall', api.custom(assert.encodedCall, {
        name: 'assert.encodedCall',
        sig: 'assert.encodedCall(conn, type, exp)',
      }));
      const db = new MockDB(['Book']);

      const {Book} = db.models;
      //[
      const conn = ConnTH.mockConnection();
      const book1 = await Book.create();
      const book2 = await Book.create();

      class MyUnion extends Union {
        async loadInitial(encoder, discreteLastSubscribed) {
          await Book.query.forEach((doc) => {encoder.addDoc(doc)});
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      await union.addSub(sub);

      assert.encodedCall(conn, 'A', ['Book', {_id: 'book1', name: 'Book 1'}]);
      //]
    });
  });
});
