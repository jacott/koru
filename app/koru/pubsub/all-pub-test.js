isServer && define((require, exports, module)=>{
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

  const {stub, spy, onEnd, intercept, match: m, stubProperty} = TH;

  const AllPub = require('./all-pub');

  const API = api;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let conn, gDict;

    beforeEach(()=>{
      conn = ConnTH.mockConnection('s123', session);
      gDict = session.globalDict;
    });

    afterEach(()=>{
      ConnTH.stopAllSubs(conn);
      AllPub.resetConfig();
    });

    test("requireUserId", ()=>{
      api.property('requireUserId', {info: 'require user to be signed in'});
      TH.noInfo();
      onEnd(()=>{MyAllPub.pubName = void 0});
      //[
      class MyAllPub extends AllPub {}
      MyAllPub.pubName = "All";

      conn.onSubscribe("sub1", 1, "All");
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub1', 1, 200, m.number]);

      conn.sendBinary.reset();
      MyAllPub.requireUserId = true;
      conn.onSubscribe("sub2", 1, "All");
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 403, 'Access denied']);

      conn.sendBinary.reset();
      conn.userId = "user123";
      conn.onSubscribe("sub2", 1, "All");
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 200, m.number]);
      //]
    });

    test("includedModels", ()=>{
      /**
       * Return an iterator over the models that are included in the subscription
       **/
      api.method();
      //[
      const db = new MockDB(['Book', 'Author']);
      const {Book, Author} = db.models;
      assert.equals(Array.from(AllPub.includedModels()).map(m => m.modelName).sort(), [
        'Author', 'Book']);
      //]
    });

    test("init", ()=>{
      /**
       * init will send the contents of the database to each client that subscribes. This method is
       * called automatically and only needs to be overridden if additionaly setup is required.
       *
       * When multiple clients connect, within the same time period, only one pass of the DB is
       * made and the result is sent to all waiting clients.
       **/
      api.protoMethod();
      //[
      const db = new MockDB(["Book"]);
      const mc = new MockConn(conn);

      const {Book} = db.models;
      const book1 = Book.create();
      const book2 = Book.create();

      class MyAllPub extends AllPub {}
      //]
      MyAllPub.pubName = "All";

      onEnd(()=>{MyAllPub.pubName = void 0});

      const future = new util.Future;

      const {forEach} = book1.constructor.query;

      book1.constructor.query.forEach = func =>{
        future.wait();
        forEach(func);
      };

      //[#
      let sub1, sub2;
      koru.runFiber(()=>{
        sub1 = conn.onSubscribe('s123', 1, 'All');
      });
      koru.runFiber(()=>{
        sub2 = conn.onSubscribe('s124', 1, 'All');
      });

      future.return();

      assert.calledTwice(mc.sendEncoded);
      assert.same(mc.sendEncoded.firstCall.args[0], mc.sendEncoded.lastCall.args[0]);

      mc.assertAdded(book1);
      mc.assertAdded(book2);
      //]

      mc.sendEncoded.reset();
      const sub3 = conn.onSubscribe('s124', 1, 'All');

      mc.assertAdded(book1);
      mc.assertAdded(book2);
    });

    test("excludeModel", ()=>{
      /**
       * Exclude {#koru/model/main}s from being published. UserLogin is always excluded. This will
       * clear {#.includeModel}

       * @param ...names one or more model names to exclude
       **/
      api.method();
      let now = util.dateNow(); intercept(util, "dateNow", ()=>now);

      //[
      const models = "Book Author UserLogin ErrorLog AuditLog".split(" ");
      const db = new MockDB(models);
      const mc = new MockConn(conn);
      //]
      ModelMap.NotAModel = {onChange: stub()}; // has no query method
      models.push("NotAModel");
      //[#

      const {Book, Author, UserLogin, AuditLog, ErrorLog} = db.models;
      const book = Book.create();
      const author = Author.create();
      const userLogin = UserLogin.create();
      const auditLog = AuditLog.create();
      const errorLog = ErrorLog.create();

      class MyAllPub extends AllPub {}
      MyAllPub.pubName = "All"; // register publication All
      //]
      onEnd(()=>{MyAllPub.pubName = void 0});
      //[#
      MyAllPub.excludeModel("AuditLog", "ErrorLog");

      const sub = conn.onSubscribe("s123", 1, "All");
      //]
      onEnd(()=>{sub && sub.stop()});
      assert.calledWith(conn.sendBinary, "Q", ["s123", 1, 200, now]);
      refute.called(ModelMap.NotAModel.onChange);
      //[#
      mc.assertAdded(book);
      mc.assertAdded(author);
      mc.refuteAdded(userLogin);
      mc.refuteAdded(auditLog);
      mc.refuteAdded(errorLog);

      let bookChange, auditLogChange;
      TransQueue.transaction(()=>{
        bookChange = db.change(book);
        auditLogChange = db.change(auditLog);
      });
      mc.assertChange(bookChange);
      mc.refuteChange(auditLogChange);
      //]
    });

    test("includeModel", ()=>{
      /**
       * Explicitly include the {#koru/model/main}s which should be published. All other models are
       * excluded. This clears {#.excludeModel}

       * @param ...names one or more model names to include
       **/
      api.method();
      let now = util.dateNow(); intercept(util, "dateNow", ()=>now);

      //[
      const models = "Book Author UserLogin ErrorLog AuditLog".split(" ");
      const db = new MockDB(models);
      const mc = new MockConn(conn);

      const {Book, Author, UserLogin, AuditLog, ErrorLog} = db.models;
      const book = Book.create();
      const author = Author.create();
      const userLogin = UserLogin.create();
      const auditLog = AuditLog.create();
      const errorLog = ErrorLog.create();

      class MyAllPub extends AllPub {}
      MyAllPub.pubName = "All"; // register publication All
      //]
      onEnd(()=>{MyAllPub.pubName = void 0});
      //[#
      MyAllPub.includeModel("UserLogin", "Author");

      assert.equals(Array.from(MyAllPub.includedModels()).map(m => m.modelName).sort(), [
        'Author', 'UserLogin']);

      const sub = conn.onSubscribe("s123", 1, "All");
      //]
      onEnd(()=>{sub && sub.stop()});
      assert.calledWith(conn.sendBinary, "Q", ["s123", 1, 200, now]);
      //[#
      mc.refuteAdded(book);
      mc.assertAdded(author);
      mc.assertAdded(userLogin);
      mc.refuteAdded(auditLog);
      mc.refuteAdded(errorLog);

      let bookChange, authorChange;
      TransQueue.transaction(()=>{
        bookChange = db.change(book);
        authorChange = db.change(author);
      });
      mc.refuteChange(bookChange);
      mc.assertChange(authorChange);
      //]
    });
  });
});
