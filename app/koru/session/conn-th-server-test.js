define((require, exports, module)=>{
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

  const {stub, spy, onEnd, util, intercept} = TH;

  const ConnTH = require('koru/session/conn-th-server');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectName: 'ConnTH'});
    });

    test("mockConnection", ()=>{
      /**
       * Create a connection useful for testing publications.
       **/
      api.method();
      //[
      const conn = ConnTH.mockConnection('sess123');
      class Library extends Publication {
      }
      Library.pubName = 'Library';

      const sub1 = conn.onSubscribe("sub1", 1, 'Library');
      onEnd(() => {ConnTH.stopAllSubs(conn)});

      assert.same(sub1.conn, conn);
      //]
    });

    test("stopAllSubs", ()=>{
      /**
       * Stop all stubs for a connection. Useful in test teardown to ensure observers have stopped.
       **/
      api.method();
      //[
      const conn = ConnTH.mockConnection('sess123');
      class Library extends Publication {
      }
      Library.pubName = 'Library';

      const sub1 = conn.onSubscribe("sub1", 1, 'Library');
      const stop = spy(sub1, 'stop');

      ConnTH.stopAllSubs(conn);

      assert.called(stop);
      //]
    });

    test("decodeEncodedCall", ()=>{
      /**
       * convert an encoded call back to objects
       **/
      api.method();
      const db = new MockDB(['Book']);

      const {Book} = db.models;
      //[
      const conn = ConnTH.mockConnection();
      const book1 = Book.create();
      const book2 = Book.create();

      class MyUnion extends Union {
        loadInitial(encoder, discreteLastSubscribed) {
          Book.query.forEach(doc =>{encoder.addDoc(doc)});
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      union.addSub(sub);

      assert.equals(ConnTH.decodeEncodedCall(conn, conn.sendEncoded.firstCall), {
        type: 'W',
        data: [
          ['A', ['Book', {_id: 'book1', name: 'Book 1'}]],
          ['A', ['Book', {_id: 'book2', name: 'Book 2'}]]
        ]});
      //]
    });

    test("assert.encodedCall", ()=>{
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
      const book1 = Book.create();
      const book2 = Book.create();

      class MyUnion extends Union {
        loadInitial(encoder, discreteLastSubscribed) {
          Book.query.forEach(doc =>{encoder.addDoc(doc)});
        }
      }
      const union = new MyUnion();

      const sub = new Publication({id: 'sub1', conn});
      union.addSub(sub);

      assert.encodedCall(conn, 'A', ['Book', {_id: 'book1', name: 'Book 1'}]);
      //]
    });
  });
});
