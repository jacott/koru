isClient && define((require, exports, module) => {
  'use strict';
  /**
   * A Subscription is a abstract interface for subscribing to publications.
   *
   * See also {#../publication}
   **/
  const koru            = require('koru');
  const Model           = require('koru/model');
  const BaseModel       = require('koru/model/base-model');
  const Query           = require('koru/model/query');
  const MockServer      = require('koru/pubsub/mock-server');
  const Match           = require('koru/pubsub/model-match');
  const SubscriptionSession = require('koru/pubsub/subscription-session');
  const Session         = require('koru/session');
  const State           = require('koru/session/state').constructor;
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const ClientLogin     = require('koru/user-account/client-login');

  const {private$} = require('koru/symbols');

  const {stub, spy, util, intercept, stubProperty, match: m} = TH;

  const Subscription = require('./subscription');

  const mockServer = new MockServer(Session);

  const {messageResponse$, connected$} = SubscriptionSession[private$];

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    const origState = Session.state;
    beforeEach(() => {
      stub(Session, 'sendBinary');
      Session.state._state = 'ready';
    });

    afterEach(() => {
      SubscriptionSession.unload(Session);
      Session.state = origState;
    });

    test('constructor', () => {
      /**
       * Create a subscription

       * @param {...any-type} [args] the arguments to send to the publication.
       * @param session The session to subscribe to (defaults to {#koru/session/main}).

       **/
      const Subscription = api.class();

      const module = new TH.MockModule('library-sub');
      //[
      class Library extends Subscription {
      }
      Library.module = module;
      assert.same(Library.pubName, 'Library');

      const sub = new Library({shelf: 'mathematics'});

      assert.same(sub._id, '1');
      assert.equals(sub.args, {shelf: 'mathematics'});

      assert.same(sub.subSession, SubscriptionSession.get(Session));

      const sub2 = new Library(Session);
      assert.same(sub.subSession, sub2.subSession);
      assert.same(sub2._id, '2');
      //]
    });

    test('connect', () => {
      /**
       * Connect to the {#../publication} when session is ready.
       *
       *
       **/
      api.protoMethod();
      const module = new TH.MockModule('library-client');

      const waitForServer = () => {
        assert.calledWith(Session.sendBinary, 'Q', [
          '1', 1, 'Library', {shelf: 'mathematics'}, 0]);
        mockServer.sendSubResponse(['1', 1, 200, Date.now()]);
      };

      //[
      class Library extends Subscription {
      }
      Library.module = module;

      const sub = new Library({shelf: 'mathematics'});
      assert.same(sub.state, 'new');
      assert.isTrue(sub.isClosed);

      sub.connect();
      assert.same(sub.state, 'connect');
      assert.isFalse(sub.isClosed);
      waitForServer();

      assert.same(sub.state, 'active');
      assert.isFalse(sub.isClosed);
      //]
    }),

    test('onConnect', () => {
      /**
       * Observe connection completions. The `callback` is called on success with a null argument,
       * on error with an `error` argument, and if stopped before connected with

       * `koru.Error(409, 'stopped')`.

       * Callbacks will only be called once. To be called again after a re-connect they will need to
       * be set up again inside the callback.

       * @param callback called with an `error` argument.

       * @returns handler with a `stop` method to cancel the onConnect.
       *
       **/
      api.protoMethod();
      const module = new TH.MockModule('library-client');

      const waitForServerResponse = (sub, {error, lastSubscribed}) => {
        assert.calledWith(Session.sendBinary, 'Q', [
          '1', 1, 'Library', {shelf: 'mathematics'}, 0]);
        if (error === null) {
          mockServer.sendSubResponse([sub._id, 1, 200, lastSubscribed]);
        } else {
          mockServer.sendSubResponse([sub._id, 1, error.code, error.reason]);
        }
      };

      //[
      class Library extends Subscription {
      }
      Library.module = module;

      { /** success */
        const sub1 = new Library({shelf: 'mathematics'});
        let resonse;
        sub1.onConnect((error) => {
          resonse = {error, state: sub1.state};
        });

        sub1.connect();

        const lastSubscribed = Date.now();
        waitForServerResponse(sub1, {error: null, lastSubscribed});

        assert.equals(resonse, {error: null, state: 'active'});
        assert.same(sub1.lastSubscribed, lastSubscribed);

        //]
        resonse = null;
        stub(sub1.subSession, 'connect');
        sub1.connect();
        sub1.subSession.connect.restore();
        waitForServerResponse(sub1, {error: null});
        assert.same(resonse, null);
        //[#
      }

      { /** error **/
        const sub2 = new Library();

        let resonse;
        sub2.onConnect((error) => {
          resonse = {error, state: sub2.state};
        });

        sub2.connect({shelf: 123});

        waitForServerResponse(sub2, {error: {code: 400, reason: {self: [['is_invalid']]}}});

        assert.equals(resonse, {
          error: m((err) => (err instanceof koru.Error) &&
                   err.error === 400 &&
                   util.deepEqual(err.reason, {self: [['is_invalid']]})),
          state: 'stopped'});
      }

      { /** stopped early **/
        const sub3 = new Library();

        let resonse;
        sub3.onConnect((error) => {
          resonse = {error, state: sub3.state};
        });

        sub3.connect({shelf: 'history'});

        sub3.stop();

        assert.equals(resonse, {
          error: m((e) => e.error == 409 && e.reason == 'stopped'), state: 'stopped'});

        assert.isTrue(sub3.isClosed);
      }
      //]
    });

    test('onConnect already connected', () => {
      const connect = stub(SubscriptionSession.prototype, 'connect');
      class Library extends Subscription {}
      const sub = Library.subscribe();

      sub[connected$]({});

      const callback = stub();
      const handle = sub.onConnect(callback);
      sub[connected$]({});
      assert.calledWith(callback, null);
    });

    test('onConnect during stop', () => {
      const sub = new Subscription();
      const oc2 = stub();
      let called = false;
      sub.onConnect(() => {
        called = true;
        sub.onConnect(oc2);
      });

      sub.stop();
      assert.isTrue(called);
      refute.called(oc2);

      sub.connect();
      sub.stop();
      assert.called(oc2);
    });

    test('match', () => {
      /**
       * Register a match function used to check if a document should
       * be in the database.

       * @param modelName the name of the model or the model itself
       **/
      api.protoMethod();

      const module = new TH.MockModule('library-client');

      const regBook = spy(Match.prototype, 'register').withArgs('Book', TH.match.func);

      class Book extends Model.BaseModel {
        static get modelName() {return 'Book'}
      }

      //[
      class Library extends Subscription {
        constructor(args) {
          super(args);
          this.match(Book, (doc) => /lord/i.test(doc.name));
        }
      }
      //]
      Library.module = module;

      const sub1 = new Library();

      assert.isTrue(regBook.args(0, 1)({name: 'Lord of the Flies'}));
      assert.equals(sub1._matches, {Book: m((n) => n.modelName === 'Book')});
      const myFunc = () => {};
      sub1.match('Book', myFunc);
      assert.equals(sub1._matches, {Book: m((n) => n.value === myFunc)});
    });

    test('unmatch', () => {
      /**
       * Deregister a {##match} function.

       * @param modelName the name of the model or the model itself
       **/
      api.protoMethod();

      const module = new TH.MockModule('library-client');

      class Book extends Model.BaseModel {
        static get modelName() {return 'Book'}
      }

      //[
      class Library extends Subscription {
        constructor(args) {
          super(args);
          this.match(Book, (doc) => /lord/i.test(doc.name));
        }

        noBooks() {
          this.unmatch(Book);
        }
      }
      //]
      Library.module = module;

      const sub1 = new Library();
      sub1.noBooks();

      assert.equals(sub1._matches, {Book: void 0});
      sub1.match('Book', () => {});
      sub1.unmatch('Book');
      assert.equals(sub1._matches, {Book: void 0});
    });

    test('stop', () => {
      /**
       * Stops a subscription. Releases any matchers that were set up and calls {##stopped}.
       */
      api.protoMethod();

      class Book extends Model.BaseModel {}
      Book.define({
        name: 'Book',
        fields: {title: 'text', pageCount: 'number'},
      });
      after(() => {Model._destroyModel('Book', 'drop')});
      const simDocs = {
        doc1: ['del'],
        doc2: ['del'],
      };
      intercept(Query, 'simDocsFor', (model) => model === Book && simDocs);
      //[
      const doc1 = Book.create({_id: 'doc1'});
      const doc2 = Book.create({_id: 'doc2'});
      const doc3 = Book.create({_id: 'doc3'});

      const mr = SubscriptionSession.get(Session).match.register('Book', (doc) => {
        return doc === doc2;
      });
      //]
      after(() => {mr.delete()});

      //[#
      class Library extends Subscription {
        stopped(unmatch) {
          unmatch(doc1);
          unmatch(doc2);
        }
      }//]
      api.protoMethod('stopped', {intro() {
        /**
         * Override this method to be called with an `unmatch` function when the subscription is
         * stopped.

         * @param unmatch can be called on all documents that no longer match this subscription.
         **/
      }, subject: Library.prototype});
      //[#
      const sub = new Library();
      sub.match('Book', () => true);
      sub.connect();
      assert(Book.findById('doc1'));
      assert(sub.subSession.match.has(doc1, 'stopped'));
      sub.stop();

      refute(Book.findById('doc1'));
      assert(Book.findById('doc2'));
      assert(Book.findById('doc3'));

      assert.isTrue(sub.isClosed);
      //]

      assert.equals(simDocs, {doc2: ['del']});
      assert.equals(sub._matches, {});
    });

    test('filterDoc', () => {
      /**
       * Remove a model document if it does not match this subscription

       * @param doc the document to test if matches a matcher

       **/
      api.protoMethod();

      const filterDoc = stub(SubscriptionSession.prototype, 'filterDoc').returns(true);
      class Library extends Subscription {}

      const book1 = {_id: 'book1'};

      //[
      const sub = new Library();

      sub.filterDoc(book1);
      //]

      assert.calledWithExactly(filterDoc, book1);

      assert.isTrue(sub.filterDoc(book1));
    });

    test('filterModels', () => {
      /**
       * Remove model documents that do not match this subscription
       **/
      api.protoMethod();

      const filterModels = stub(SubscriptionSession.prototype, 'filterModels');
      class Library extends Subscription {}

      //[
      const sub = new Library();

      sub.filterModels('Book', 'Catalog');
      //]

      assert.calledWithExactly(filterModels, ['Book', 'Catalog']);
      assert.same(filterModels.firstCall.thisValue, sub.subSession);
    });

    test('subscribe', () => {
      /**
       * A convience method to create a subscription that connects to the publication and calls
       * callback on connect.

       * @param {any-type} args the arguments to send to the server

       * @param [callback] called when connection complete

       * @return instance of subscription
       **/
      api.method();
      const connect = stub(SubscriptionSession.prototype, 'connect');
      const responseFromServer = () => {connect.firstCall.args[0][connected$]({})};

      //[
      class Library extends Subscription {
      }
      let response;
      const sub = Library.subscribe({shelf: 'mathematics'}, (error) => {
        response = {error, state: sub.state};
      });
      assert.same(sub.state, 'connect');
      assert.same(response, void 0);

      responseFromServer();

      assert.equals(response, {error: null, state: 'active'});
      //]
    });

    test('lastSubscribedMaximumAge', () => {
      /**
       * Any subscription with a lastSubscribed older than this sends 0 (no last subscribed) to the
       * server. Specified in milliseconds. Defaults to -1 (always send 0).

       **/
      api.property();
      assert.same(Subscription.lastSubscribedMaximumAge, -1);
      api.done();

      let now = util.dateNow(); intercept(util, 'dateNow', () => now);
      let lastSubscribedMaximumAge = now - util.DAY;

      stubProperty(Subscription, 'lastSubscribedMaximumAge', {get: () => lastSubscribedMaximumAge});

      const sub = new Subscription();
      const lastSubscribed = now + 1 - 1 * util.DAY;
      sub.lastSubscribed = lastSubscribed;
      sub.connect();

      assert.calledWith(Session.sendBinary, 'Q', ['1', 1, 'Subscription', undefined, lastSubscribed]);

      Session.sendBinary.reset();

      const sub2 = new Subscription();
      sub2.lastSubscribed = now - 2 * util.DAY;
      sub2.connect();
      assert.calledWith(Session.sendBinary, 'Q', ['2', 1, 'Subscription', undefined, 0]);

      lastSubscribedMaximumAge = -1;
      const sub3 = new Subscription();
      sub3.lastSubscribed = now;
      sub3.connect();
      assert.calledWith(Session.sendBinary, 'Q', ['3', 1, 'Subscription', undefined, 0]);
    });

    test('reconnecting', () => {
      /**
       * Override this method to be called when a subscription reconnect is attempted. Calling
       * {##stop} within this method will stop the reconnect.
       *
       * When there is no `lastSubscribed` time, or lastSubscribed is older than
       * `lastSubscribedMaximumAge`, {#.markForRemove} should be called on documents matching this
       * subscription.
       **/
      api.protoMethod();
      class Book extends BaseModel {
      }
      Book.define({name: 'Book'});
      after(() => {Model._destroyModel('Book', 'drop')});
      intercept(Session, 'reconnected', () => {
        Session.state._onConnect['10-subscribe2']();
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

      Session.reconnected(); // simulate a session reconnect

      assert.calledOnce(reconnecting);
      //]

      // ensure that this method is called once-and-only-once before a reconnect attempt
    });

    test('stop clears matchers', () => {
      class MySub extends Subscription {
        constructor() {
          super();
          this.match('Foo', () => true);
        }
      }
      const sub = new MySub();
      refute(util.isObjEmpty(sub._matches));
      sub.stop();
      assert(util.isObjEmpty(sub._matches));
      refute(sub.subSession.match.has({constructor: {modelName: 'Foo'}}));
    });

    test('markForRemove', () => {
      /**
       * Mark the given document as a simulated add which will be removed if not updated by the
       * server. This method can be called without a `this` value
       **/
      api.method();

      class Book extends BaseModel {
      }
      Book.define({name: 'Book'});
      after(() => {Model._destroyModel('Book', 'drop')});

      //[
      const {markForRemove} = Subscription;

      const book1 = Book.create();
      markForRemove(book1);
      assert.equals(Query.simDocsFor(Book)[book1._id], ['del', void 0]);
      //]
    });

    test('userIdChanged', () => {
      /**
       * Override this method to change the default behavior of doing nothing when the user id
       * changes.
       **/
      after(() => {util.thread.userId = void 0});
      api.protoMethod();
      class Library extends Subscription {
      }

      const sub = Library.subscribe([123, 456]);
      spy(sub, 'userIdChanged');
      ClientLogin.setUserId(Session, 'uid123');
      assert.calledWithExactly(sub.userIdChanged, 'uid123', void 0);

      ClientLogin.setUserId(Session, 'uid456');
      assert.calledWithExactly(sub.userIdChanged, 'uid456', 'uid123');

      ClientLogin.setUserId(Session, void 0);
      assert.calledWithExactly(sub.userIdChanged, void 0, 'uid456');
    });

    test('onMessage', () => {
      /**
       * Override this method to receive an unsolicited `message` from the publication server.

       * @param {any-type} message
       **/
      api.protoMethod();
      const server = {
        postMessage(message) {
          Session._commands.Q.call(Session, [sub._id, 0, message]);
        },
      };
      //[
      class Library extends Subscription {
        onMessage(message) {
          this.answer = message;//]
          super.onMessage(message);//[#
        }
      }

      const sub = Library.subscribe([123]);

      server.postMessage({hello: 'subscriber'});
      assert.equals(sub.answer, {hello: 'subscriber'});

      //]
    });

    test('postMessage', () => {
      /**
       * Send a message to publication. Messages can be used to alter the state of the publication.
       *
       * Messages are NOT re-transmitted if the connection is lost; Intead the subscription `args`
       * should be modified to reflect the change in state. In such cases the callback will be
       * added to the {##onConnect} queue.
       *
       * See {#../publication#onMessage}

       * @param {any-type} message the message to send
       * @param callback a function with the arguments `error`, `result`. This function will be
       * called when the message has finished or; if connection lost of not yet started, will be
       * called when the subscription is active with no `result` (via the {##onConnect} queue).
       **/
      api.protoMethod();

      const receivePost = (sub) => {sub[messageResponse$](['sub1', 2, 0, 'added'])};

      //[
      class Library extends Subscription {
      }

      const onConnect = stub();
      const sub = Library.subscribe([123, 456], onConnect);

      sub.args.push(789);
      let done = false;
      sub.postMessage({addArg: 789}, (err, result) => {
        if (err) sub.stop();
        done = result === 'added';
      });
      receivePost(sub);
      assert.isTrue(done);
      //]

      refute.exception(() => {
        sub.stop(); // ensure runMessageCallbacks ignores fulfilled (undefined) callbacks
      });
    });
  });
});
