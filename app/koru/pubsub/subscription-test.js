isClient && define((require, exports, module)=>{
  /**
   * A Subscription is a abstract interface for subscribing to publications.
   *
   * See also {#../publication}
   **/
  const Model           = require('koru/model');
  const Query           = require('koru/model/query');
  const MockServer      = require('koru/pubsub/mock-server');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const SessionBase     = require('koru/session/base').constructor;
  const Match           = require('koru/session/match');
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, util, intercept} = TH;

  const Subscription = require('./subscription');

  const session = new SessionBase(module.id);

  const mockServer = new MockServer(session);

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      session.state = new State();
      session.sendBinary = stub();
      session.state._state = 'ready';
    });

    afterEach(()=>{
      SubscriptionSession.unload(session);
    });

    test("constructor", ()=>{
      /**
       * Create a subscription

       * @param session The session to subscribe to (defaults to {#koru/session/main}).

       **/
      util.FULL_STACK = 1;
      const Subscription = api.class();

      const module = new TH.MockModule("library-sub");
      //[
      class Library extends Subscription {
      }
      Library.module = module;
      assert.same(Library.pubName, 'Library');

      const sub = new Library(session);

      assert.same(sub._id, '1');

      assert.same(sub.subSession, SubscriptionSession.get(session));

      const sub2 = new Library(session);
      assert.same(sub.subSession, sub2.subSession);
      assert.same(sub2._id, '2');
      //]
    });

    test("connect", ()=>{
      /**
       * Connect to the {#../publication} when session is ready.
       *
       * @param {...any-type} [params] a list of parameters to send to
       * the publication.
       *
       **/
      api.protoMethod();
      const module = new TH.MockModule("library-client");

      const waitForServer = ()=>{
        assert.calledWith(session.sendBinary, 'Q', [
          '1', 1, 'Library', [{shelf: 'mathematics'}], undefined]);
        mockServer.sendSubResponse(['1', 1, 200, Date.now()]);
      };

      //[
      class Library extends Subscription {
        connect(params) {
          // maybe preload from indexeddb then
          super.connect(params);
        }
      }
      Library.module = module;

      const sub = new Library(session);
      assert.same(sub.state, 'setup');

      sub.connect({shelf: 'mathematics'});
      assert.same(sub.state, 'connect');
      assert.equals(sub.args, [{shelf: 'mathematics'}]);

      waitForServer();

      assert.same(sub.state, 'active');
      //]
    }),

    test("onConnect", ()=>{
      /**
       * Observe connection completions. The `callback` is called on success with a null argument,
       * on error with an `error` argument, and if stopped before connected with an `error` argument
       * with `code` 409, `reason` "stopped".

       * Callbacks will only be called once. To be called again after a re-connect they will need to
       * be set up again inside the callback.
       *
       * @param callback called with an `error` argument.

       * @returns handler with a `stop` method to cancel the onConnect.
       *
       **/
      api.protoMethod();
      const module = new TH.MockModule("library-client");

      const waitForServerResponse = (sub, {error, lastSubscribed})=>{
        assert.calledWith(session.sendBinary, 'Q', [
          '1', 1, 'Library', [{shelf: 'mathematics'}], undefined]);
        if (error === null)
          mockServer.sendSubResponse([sub._id, 1, 200, lastSubscribed]);
        else
          mockServer.sendSubResponse([sub._id, 1, error.code, error.reason]);
      };

      //[
      class Library extends Subscription {
      }
      Library.module = module;

      { /** success */
        const sub1 = new Library(session);
        let resonse;
        sub1.onConnect((error)=>{
          resonse = {error, state: sub1.state};
        });

        sub1.connect({shelf: 'mathematics'});

        const lastSubscribed = Date.now();
        waitForServerResponse(sub1, {error: null, lastSubscribed});

        assert.equals(resonse, {error: null, state: 'active'});
        assert.same(sub1.lastSubscribed, lastSubscribed);

        //]
        resonse = null;
        sub1.state = 'connect';
        waitForServerResponse(sub1, {error: null});
        assert.same(resonse, null);
        //[#
      }

      { /** error **/
        const sub2 = new Library(session);

        let resonse;
        sub2.onConnect((error)=>{
          resonse = {error, state: sub2.state};
        });

        sub2.connect({shelf: 123});

        waitForServerResponse(sub2, {error: {code: 400, reason: {self: [['is_invalid']]}}});

        assert.equals(resonse, {
          error: {code: 400, reason: {self: [['is_invalid']]}}, state: 'stopped'});
      }

      { /** stopped early **/
        const sub3 = new Library(session);

        let resonse;
        sub3.onConnect((error)=>{
          resonse = {error, state: sub3.state};
        });

        sub3.connect({shelf: 'history'});

        sub3.stop();

        assert.equals(resonse, {
          error: {code: 409, reason: 'stopped'}, state: 'stopped'});
      }
      //]
    });

    test("match", ()=>{
      /**
       * Register a match function used to check if a document should
       * be in the database.
       **/
      api.protoMethod();

      const module = new TH.MockModule("library-client");

      const regBook = stub(Match.prototype, "register").withArgs('Book', TH.match.func)
            .returns("registered Book");
      //[
      class Book extends Model.BaseModel {
        static get modelName() {return 'Book'}
      }

      class Library extends Subscription {
        connect() {
          this.match(Book, doc => /lord/i.test(doc.name));

          super.connect();
        }
      }
      Library.module = module;

      const sub1 = new Library(session);
      sub1.connect();

      assert.equals(sub1._matches, {Book: 'registered Book'});
      assert.isTrue(regBook.args(0, 1)({name: "Lord of the Flies"}));
    });

    test("stop", ()=>{
      /**
       * Ensures when we stop that all docs the subscription doesn't want are removed unless matched
       * elsewhere. A stopped subscription can not be reused.
       */
      api.protoMethod();

      class Book extends Model.BaseModel {}
      Book.define({
        name: 'Book',
        fields: {title: 'text', pageCount: 'number'}
      });
      onEnd(()=>{Model._destroyModel('Book', 'drop')});
      const simDocs = {
        doc1: ['del'],
        doc2: ['del'],
      };
      intercept(Query, 'simDocsFor', model => model === Book && simDocs);
      //[
      const doc1 = Book.create({_id: 'doc1'});
      const doc2 = Book.create({_id: 'doc2'});
      const doc3 = Book.create({_id: 'doc3'});

      const mr = SubscriptionSession.match.register('Book', (doc, reason) =>{
        assert.same(reason, 'stopped');

        return doc === doc2;
      });
      //]
      onEnd(()=>{mr.delete()});

      //[
      class Library extends Subscription {
        stopped(unmatch) {
          unmatch(doc1);
          unmatch(doc2);
        }
      }

      const sub = new Library(session);
      sub.stop();

      refute(Book.findById('doc1'));
      assert(Book.findById('doc2'));
      assert(Book.findById('doc3'));
      //]
      assert.equals(simDocs, {doc2: ['del']});
    });

    test("filterModels", ()=>{
      /**
       * Remove model documents that do not match this subscription
       **/
      api.protoMethod();

      stub(SubscriptionSession, '_filterModels');
      class Library extends Subscription {}

      //[
      const sub = new Library(session);

      sub.filterModels('Book', 'Catalog');
      //]

      assert.calledWithExactly(SubscriptionSession._filterModels, {Book: true, Catalog: true});
    });

    test("subscribe", ()=>{
      /**
       * A convience method to create a subscription that connects to the publication and calls
       * callback on connect.

       * @param args either an array of arguments or an object

       * @param [callback] called when connection complete

       * @return instance of subscription
       **/
      api.method();
      const connect = stub(SubscriptionSession.prototype, 'connect');
      const responseFromServer = ()=>{connect.firstCall.args[0]._connected({})};

      //[
      class Library extends Subscription {
      }
      let response;
      const sub = Library.subscribe({shelf: 'mathematics'}, error =>{
        response = {error, state: sub.state};
      });
      assert.same(sub.state, 'connect');
      assert.same(response, undefined);

      responseFromServer();

      assert.equals(response, {error: null, state: 'active'});
      //]
    });
  });
});
