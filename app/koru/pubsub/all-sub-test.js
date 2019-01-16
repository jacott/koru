false && isClient && define((require, exports, module)=>{
  /**
   * AllSub is an extended {#../subscription} which will subscribe to all documents in
   * every defined {#koru/model/main}.
   *
   * See Also {#../all-pub}
   **/
  const Model           = require('koru/model');
  const ModelMap        = require('koru/model/map');
  const TH              = require('koru/model/test-db-helper');
  const MockDB          = require('koru/pubsub/mock-db');
  const Subscription    = require('koru/pubsub/subscription');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const session         = require('koru/session');
  const State           = require('koru/session/state').constructor;
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, intercept, stubProperty} = TH;

  const AllSub = require('./all-sub');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      SubscriptionSession.unload(session);
      AllSub.resetConfig();
    });

    test("subscribe", ()=>{
      /**
       * Subscribe to all models in {#koru/models/model-map}
       **/
      api.method();
      const db = new MockDB(['Book', 'Author']);

      const connect = stub(Subscription.prototype, 'connect');
      const match = stub(Subscription.prototype, 'match');

      //[
      const sub = AllSub.subscribe();
      //]

      assert.calledOnce(connect);

      assert.same(match.firstCall.thisValue, sub);
      assert.same(connect.firstCall.thisValue, sub);

      assert.calledWith(match, 'Author');
      assert.calledWith(match, 'Book');

      assert.isTrue(match.firstCall.args[1]());
      assert.isTrue(match.lastCall.args[1]({}));
    });

    test("reconnecting", ()=>{
      class Book extends Model.BaseModel {
      }
      Book.define({name: 'Book'});
      onEnd(()=>{Model._destroyModel('Book', 'drop')});

      const b1 = Book.create('');

      const sub = AllSub.subscribe();
      sub.reconnecting();
      sub.stop();

      refute(Book.findById(b1._id));
    });

    test("isModelExcluded", ()=>{
      /**
       * Check is a model name is excluded.
       **/
      api.method();
      //[
      assert.isTrue(AllSub.isModelExcluded('UserLogin'));
      assert.isFalse(AllSub.isModelExcluded('User'));
      //]
    });

    test("excludeModel", ()=>{
      /**
       * Exclude {#koru/model/main}s from being subscribed to. UserLogin is always excluded. This will
       * clear {#.includeModel}

       * @param ...names one or more model names to exclude
       **/
      api.method();

      //[
      const models = "Book Author UserLogin ErrorLog AuditLog".split(" ");
      const db = new MockDB(models);
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

      class MyAllSub extends AllSub {}
      MyAllSub.pubName = "All"; // register publication All

      MyAllSub.excludeModel("AuditLog", "ErrorLog");

      const sub = MyAllSub.subscribe();

      assert(sub._matches.Book);
      assert(sub._matches.Author);
      refute(sub._matches.UserLogin);
      refute(sub._matches.AuditLog);
      refute(sub._matches.ErrorLog);
      //]
    });

    test("includeModel", ()=>{
      /**
       * Explicitly include the {#koru/model/main}s which should be published. All other models are
       * excluded. This clears {#.excludeModel}

       * @param ...names one or more model names to include
       **/
      api.method();

      //[
      const models = "Book Author UserLogin ErrorLog AuditLog".split(" ");
      const db = new MockDB(models);

      const {Book, Author, UserLogin, AuditLog, ErrorLog} = db.models;
      const book = Book.create();
      const author = Author.create();
      const userLogin = UserLogin.create();
      const auditLog = AuditLog.create();
      const errorLog = ErrorLog.create();

      class MyAllSub extends AllSub {}
      MyAllSub.pubName = "All"; // register publication All

      MyAllSub.includeModel("UserLogin", "Author");

      assert.isTrue(MyAllSub.isModelExcluded("Book"));
      assert.isFalse(MyAllSub.isModelExcluded("UserLogin"));

      const sub = MyAllSub.subscribe();

      refute(sub._matches.Book);
      assert(sub._matches.Author);
      assert(sub._matches.UserLogin);
      refute(sub._matches.AuditLog);
      refute(sub._matches.ErrorLog);
      //]
    });
  });
});
