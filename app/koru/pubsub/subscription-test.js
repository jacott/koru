isClient && define((require, exports, module)=>{
  /**
   * A Subscription is a abstract interface for subscribing to publications.
   *
   * See also {#../publication}
   **/
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const Query           = require('koru/model/query');
  const MockServer      = require('koru/pubsub/mock-server');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const session         = require('koru/session');
  const Match           = require('koru/session/match');
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const ClientLogin     = require('koru/user-account/client-login');

  const {stub, spy, onEnd, util, intercept, stubProperty} = TH;

  const Subscription = require('./subscription');

  const mockServer = new MockServer(session);

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      stubProperty(session, 'state', {value: new State()});
      stub(session, 'sendBinary');
      session.state._state = 'ready';
    });

    afterEach(()=>{
      SubscriptionSession.match._clear();
      SubscriptionSession.unload(session);
    });

    test("constructor", ()=>{
      /**
       * Create a subscription

       * @param session The session to subscribe to (defaults to {#koru/session/main}).

       **/
      const Subscription = api.class();

      const module = new TH.MockModule("library-sub");
      //[
      class Library extends Subscription {
      }
      Library.module = module;
      assert.same(Library.pubName, 'Library');

      const sub = new Library();

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
          '1', 1, 'Library', [{shelf: 'mathematics'}], 0]);
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

      const sub = new Library();
      assert.same(sub.state, 'stopped');

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
          '1', 1, 'Library', [{shelf: 'mathematics'}], 0]);
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
        const sub1 = new Library();
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
        const sub2 = new Library();

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
        const sub3 = new Library();

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

      const sub1 = new Library();
      sub1.connect();

      assert.equals(sub1._matches, {Book: 'registered Book'});
      assert.isTrue(regBook.args(0, 1)({name: "Lord of the Flies"}));
    });

    test("stop", ()=>{
      /**
       * Ensures when we stop that all docs the subscription doesn't want are removed unless matched
       * elsewhere.
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

      const sub = new Library();
      sub.match('Book', () => true);
      sub.connect();
      assert(Book.findById('doc1'));
      assert(SubscriptionSession.match.has(doc1, 'stopped'));
      sub.stop();

      refute(Book.findById('doc1'));
      assert(Book.findById('doc2'));
      assert(Book.findById('doc3'));
      //]

      assert.equals(simDocs, {doc2: ['del']});
      assert.equals(sub._matches, {});
    });

    test("filterModels", ()=>{
      /**
       * Remove model documents that do not match this subscription
       **/
      api.protoMethod();

      stub(SubscriptionSession, '_filterModels');
      class Library extends Subscription {}

      //[
      const sub = new Library();

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

    test("lastSubscribedMaximumAge", ()=>{
      /**
       * Any subscription with a lastSubscribed older than this sends 0 (no last subscribed) to the
       * server. Specified in milliseconds. Defaults to -1 (always send 0).

       **/
      api.property();
      assert.same(Subscription.lastSubscribedMaximumAge, -1);
    });

    test("reconnecting", ()=>{
      /**
       * Override this method to be called when a subscription reconnect is attempted.
       *
       * When there is no `lastSubscribed` time, or lastSubscribed is older than
       * `lastSubscribedMaximumAge`, {#.markForRemove} should be called on documents matching this
       * subscription.
       **/
      api.protoMethod();
      class Book extends BaseModel {
      }
      Book.define({name: 'Book'});
      onEnd(()=>{Model._destroyModel('Book', 'drop')});
      intercept(session, 'reconnected', ()=>{
        session.state._onConnect['10-subscribe2']();
      });
      //[
      class Library extends Subscription {
        /** ⏿ ⮧ here we override reconnecting **/
        reconnecting() {
          Book.query.forEach(Subscription.markForRemove);
        }
      }
      const reconnecting = spy(Library.prototype, 'reconnecting');

      const sub = new Library();
      sub.connect();
      refute.called(reconnecting);

      session.reconnected(); // simulate a session reconnect

      assert.calledOnce(reconnecting);
      //]

      // ensure that this method is called once-and-only-once before a reconnect attempt
    });

    test("markForRemove", ()=>{
      /**
       * Mark the given document as a simulated add which will be removed if not updated by the
       * server. This method can be called without a `this` value
       **/
      api.method();

      class Book extends BaseModel {
      }
      Book.define({name: 'Book'});
      onEnd(()=>{Model._destroyModel('Book', 'drop')});

      //[
      const {markForRemove} = Subscription;

      const book1 = Book.create();
      markForRemove(book1);
      assert.equals(Query.simDocsFor(Book)[book1._id], ['del', void 0]);
      //]
    });

    test("userIdChanged", ()=>{
      /**
       * The default behavior is to stop and reconnect the subscription when {#koru/main.userId}
       * changes. Override this method to stop the default behavior.
       **/
      onEnd(()=>{util.thread.userId = void 0});
      api.protoMethod();
      class Library extends Subscription {
      }

      const sub = Library.subscribe([123, 456]);
      spy(sub, 'stop');
      spy(sub, 'connect');
      ClientLogin.setUserId(session, 'uid123');
      assert.called(sub.stop);
      assert.calledWithExactly(sub.connect, 123, 456);
    });

    test("postMessage", ()=>{
      /**
       * Send a message to publication. Messages can be used to alter the state of the publication.
       *
       * Messages are NOT re-transmitted if the connection is lost; Intead the subscription `args`
       * should be modified to reflect the change in state.
       *
       * See {#../publication#onMessage}

       * @param {any-type} message the message to send
       * @param callback a function with the arguments `error`, `result`. This function will be
       * called when the message has finished.
       **/
      api.protoMethod();

      const receivePost = ()=>{
        session._commands.Q.call(session, [sub._id, 2, 0]);
      };

      //[
      class Library extends Subscription {
      }

      const sub = Library.subscribe([123, 456]);

      sub.args.push(789);
      let done = false;
      sub.postMessage({addArg: 789}, (err, result)=>{
        if (err) sub.stop();
        done = true;
      });
      receivePost();
      assert.isTrue(done);
      //]
    });
  });
});
