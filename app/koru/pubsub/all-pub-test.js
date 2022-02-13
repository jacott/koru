isServer && define((require, exports, module) => {
  'use strict';
  /**
   * AllPub is an extended {#../publication} which publicizes all documents in every defined
   * {#koru/model/main}.

   * By default all client subscriptions are handled by one unified observer and an identical
   * message is sent to all subscribers. When extending AllPub individual observations can go in the
   * {##init} method and union observations can go in the {##initUnion} method.
   *
   * See also {#../all-sub}
   **/
  const koru            = require('koru');
  const Future          = require('koru/future');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const session         = require('koru/session');
  const ConnTH          = require('koru/session/conn-th-server');
  const message         = require('koru/session/message');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, intercept, match: m, stubProperty} = TH;

  const AllPub = require('./all-pub');

  const API = api;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let conn, gDict;

    beforeEach(() => {
      conn = ConnTH.mockConnection('s123', session);
      gDict = session.globalDict;
    });

    afterEach(() => {
      ConnTH.stopAllSubs(conn);
      AllPub.resetConfig();
    });

    test('requireUserId', async () => {
      api.property('requireUserId', {info: 'require user to be signed in'});
      TH.noInfo();
      after(() => {MyAllPub.pubName = void 0});
      //[
      class MyAllPub extends AllPub {}
      MyAllPub.pubName = 'All';

      await conn.onSubscribe('sub1', 1, 'All');
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub1', 1, 200, m.number]);

      conn.sendBinary.reset();
      MyAllPub.requireUserId = true;
      await conn.onSubscribe('sub2', 1, 'All');
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 403, 'Access denied']);

      conn.sendBinary.reset();
      await conn.setUserId('user123');
      await conn.onSubscribe('sub2', 1, 'All');
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 200, m.number]);
      //]
    });

    test('includedModels', () => {
      /**
       * Return an iterator over the models that are included in the subscription
       **/
      api.method();
      //[
      const db = new MockDB(['Book', 'Author']);
      const {Book, Author} = db.models;
      assert.equals(Array.from(AllPub.includedModels()).map((m) => m.modelName).sort(), [
        'Author', 'Book']);
      //]
    });

    test('init', async () => {
      /**
       * init will send the contents of the database to each client that subscribes. This method is
       * called automatically and only needs to be overridden if additionaly setup is required.
       *
       * When multiple clients connect, within the same time period, only one pass of the DB is
       * made and the result is sent to all waiting clients.
       **/
      api.protoMethod();
      //[
      const db = new MockDB(['Book']);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = await Book.create();
      const book2 = await Book.create();

      class MyAllPub extends AllPub {}
      //]
      MyAllPub.pubName = 'All';

      after(() => {MyAllPub.pubName = void 0});

      const future = new Future();

      const {forEach} = Book.query;

      Book.query.forEach = async (func) => {
        await future.promise;
        await forEach(func);
      };

      //[#
      const sub1p = koru.runFiber(() => conn.onSubscribe('s123', 1, 'All'));
      const sub2p = koru.runFiber(() => conn.onSubscribe('s124', 1, 'All'));

      future.resolve();

      const sub1 = await sub1p;
      const sub2 = await sub2p;

      assert.calledTwice(mc.sendEncoded);
      assert.same(mc.sendEncoded.firstCall.args[0], mc.sendEncoded.lastCall.args[0]);

      mc.assertAdded(book1);
      mc.assertAdded(book2);
      //]

      mc.sendEncoded.reset();
      sub2.stop();
      const sub3 = await conn.onSubscribe('s124', 1, 'All');

      mc.assertAdded(book1);
      mc.assertAdded(book2);
    });

    test('excludeModel', async () => {
      /**
       * Exclude {#koru/model/main}s from being published. UserLogin is always excluded. This will
       * clear {#.includeModel}

       * @param ...names one or more model names to exclude
       **/
      api.method();
      let now = util.dateNow(); intercept(util, 'dateNow', () => now);

      //[
      const models = 'Book Author UserLogin ErrorLog AuditLog'.split(' ');
      const db = new MockDB(models);
      const mc = new MockConn(conn);
      //]
      ModelMap.NotAModel = {onChange: stub()}; // has no query method
      models.push('NotAModel');
      //[#

      const {Book, Author, UserLogin, AuditLog, ErrorLog} = db.models;
      const book = await Book.create();
      const author = await Author.create();
      const userLogin = await UserLogin.create();
      const auditLog = await AuditLog.create();
      const errorLog = await ErrorLog.create();

      class MyAllPub extends AllPub {}
      MyAllPub.pubName = 'All'; // register publication All
      //]
      after(() => {MyAllPub.pubName = void 0});
      //[#
      MyAllPub.excludeModel('AuditLog', 'ErrorLog');

      const sub = await conn.onSubscribe('s123', 1, 'All');
      //]
      after(() => {sub && sub.stop()});
      assert.calledWith(conn.sendBinary, 'Q', ['s123', 1, 200, now]);
      refute.called(ModelMap.NotAModel.onChange);
      //[#
      mc.assertAdded(book);
      mc.assertAdded(author);
      mc.refuteAdded(userLogin);
      mc.refuteAdded(auditLog);
      mc.refuteAdded(errorLog);

      let bookChange, auditLogChange;
      await TransQueue.transaction(async () => {
        bookChange = await db.change(book);
        auditLogChange = await db.change(auditLog);
      });
      mc.assertChange(bookChange);
      mc.refuteChange(auditLogChange);
      //]
    });

    test('includeModel', async () => {
      /**
       * Explicitly include the {#koru/model/main}s which should be published. All other models are
       * excluded. This clears {#.excludeModel}

       * @param ...names one or more model names to include
       **/
      api.method();
      let now = util.dateNow(); intercept(util, 'dateNow', () => now);

      //[
      const models = 'Book Author UserLogin ErrorLog AuditLog'.split(' ');
      const db = new MockDB(models);
      const mc = new MockConn(conn);

      const {Book, Author, UserLogin, AuditLog, ErrorLog} = db.models;
      const book = await Book.create();
      const author = await Author.create();
      const userLogin = await UserLogin.create();
      const auditLog = await AuditLog.create();
      const errorLog = await ErrorLog.create();

      class MyAllPub extends AllPub {}
      MyAllPub.pubName = 'All'; // register publication All
      //]
      after(() => {MyAllPub.pubName = void 0});
      //[#
      MyAllPub.includeModel('UserLogin', 'Author');

      assert.equals(Array.from(MyAllPub.includedModels()).map((m) => m.modelName).sort(), [
        'Author', 'UserLogin']);

      const sub = await conn.onSubscribe('s123', 1, 'All');
      //]
      after(() => {sub && sub.stop()});
      assert.calledWith(conn.sendBinary, 'Q', ['s123', 1, 200, now]);
      //[#
      mc.refuteAdded(book);
      mc.assertAdded(author);
      mc.assertAdded(userLogin);
      mc.refuteAdded(auditLog);
      mc.refuteAdded(errorLog);

      let bookChange, authorChange;
      await TransQueue.transaction(async () => {
        bookChange = await db.change(book);
        authorChange = await db.change(author);
      });
      mc.refuteChange(bookChange);
      mc.assertChange(authorChange);
      //]
    });
  });
});
