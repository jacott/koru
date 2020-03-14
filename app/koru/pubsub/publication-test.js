isServer && define((require, exports, module)=>{
  'use strict';
  /**
   * A Publication is a abstract interface for handling subscriptions.
   *
   * See also {#../subscription}
   **/
  const koru            = require('koru');
  const DocChange       = require('koru/model/doc-change');
  const ModelMap        = require('koru/model/map');
  const TransQueue      = require('koru/model/trans-queue');
  const Val             = require('koru/model/validation');
  const MockConn        = require('koru/pubsub/mock-conn');
  const MockDB          = require('koru/pubsub/mock-db');
  const session         = require('koru/session');
  const ConnTH          = require('koru/session/conn-th-server');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util, intercept, stubProperty, match: m} = TH;

  const Publication = require('./publication');

  const API = api;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let conn, origQ;
    beforeEach(()=>{
      origQ = session._commands.Q;
      conn = ConnTH.mockConnection("conn1");
    });

    afterEach(()=>{
      ConnTH.stopAllSubs(conn);
      session._commands.Q = origQ;
      Publication.delete('Library');
    });

    test("constructor", ()=>{
      /**
       * Build an incomming subscription.

       * @param conn The connection of the subscription

       * @param id The id of the subscription

       * @param lastSubscribed the time in ms when the subscription last connected

       **/
      const Publication = api.class();

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);
      const module = new TH.MockModule("library-pub");
      //[
      const lastSubscribed = Date.now()-util.DAY;

      let sub;
      class Library extends Publication {
        constructor(options) {
          super(options);
          sub = this;
        }
      }
      Library.module = module;
      assert.same(Library.pubName, 'Library');

      conn.onSubscribe("sub1", 1, 'Library', {shelf: "mathematics"}, lastSubscribed);


      assert.same(sub.constructor, Library);
      assert.same(sub.conn, conn);
      assert.same(sub.id, 'sub1');
      assert.same(sub.lastSubscribed, util.dateNow());
      //]
    });

    test("init", ()=>{
      /**
       * This is where to fetch and send documents matching the `args` supplied.
       * On completion of the init method the server will inform the client the connection is
       * successful. If an error is thrown then the client will be inform the connection is
       * unsuccessful.
       *
       * @param {...any-type} args from client
       **/
      api.protoMethod();

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);
      //[
      const lastSubscribed = now-util.DAY;

      let sub;
      class Library extends Publication {
        init({shelf}) {
          sub = this;
          Val.allowIfValid(typeof shelf === 'string', 'shelf');
          this.conn.added("Book", "b123", {title: "Principia Mathematica"});
        }
      }
      Library.pubName = 'Library';

      conn.onSubscribe("sub1", 1, 'Library', {shelf: "mathematics"}, lastSubscribed);

      assert.same(sub.conn, conn);
      assert.same(sub.id, 'sub1');
      assert.same(sub.lastSubscribed, util.dateNow());
      assert.calledWith(conn.added, "Book", "b123", {title: "Principia Mathematica"});
      assert.calledWith(conn.sendBinary, 'Q', ['sub1', 1, 200, util.dateNow()]);
      assert.isFalse(sub.isStopped);
      //]

      TH.noInfo();
      //[
      // Validation error
      conn.sendBinary.reset();

      conn.onSubscribe("sub1", 1, 'Library', {shelf: 123}, lastSubscribed);

      assert.calledWith(conn.sendBinary, 'Q', ['sub1', 1, 400, {shelf: [['is_invalid']]}]);
      assert.isTrue(sub.isStopped);
      //]
    });

    test("init in TransQueue transaction success", ()=>{
      let inTrans = false;
      let sub, now;
      class Library extends Publication {
        init(args) {
          sub = this;
          assert.same(util.thread.action, 'subscribe Library');
          assert.isTrue(inTrans);
        }
      }
      Library.pubName = 'Library';

      conn.sendBinary.reset();
      now = util.dateNow() - 12000; intercept(util, 'dateNow', ()=>now);
      intercept(TransQueue, 'transaction', func =>{
        inTrans = true;
        try {
          return func();
        } finally {
          inTrans = false;
        }
      });
      conn.sendBinary.invokes(c => {
        assert.isFalse(inTrans);
      });
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});
      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 1, 200, now]);
    });

    test("init in TransQueue transaction failure", ()=>{
      let inTrans = false;
      let sub;
      class Library extends Publication {
        init(args) {
          sub = this;
          assert.isTrue(inTrans);
          throw new koru.Error(404, 'not_found');
        }
      }
      Library.pubName = 'Library';

      conn.sendBinary.reset();
      intercept(TransQueue, 'transaction', func =>{
        inTrans = true;
        try {
          return func();
        } finally {
          inTrans = false;
        }
      });
      conn.sendBinary.invokes(c => {
        assert.isFalse(inTrans);
      });
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});
      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 1, 404, "not_found"]);
    });


    test("stop", ()=>{
      /**
       * Stop a subscription. This method can be called directly on the server to stop a
       * subscription. It will also be called indirectly by a stop request from the client.
       **/
      api.protoMethod();
      let sub;
      class Library extends Publication {
        init() {sub = this;}
      }
      Library.pubName = 'Library';

      conn.onSubscribe("sub1", 1, 'Library', {shelf: "mathematics"});
      conn.sendBinary.reset();
      //[
      // server stops the subscription
      sub.stop();
      assert.isTrue(sub.isStopped);
      assert.calledWith(conn.sendBinary, 'Q', [sub.id]); // tell client we're stopped
      //]
      assert.equals(conn._subs, {});
    });

    test("client stop", ()=>{
      api.protoMethod("stop");
      let sub;
      class Library extends Publication {
        init() {sub = this}
      }
      Library.pubName = 'Library';

      conn.onSubscribe("sub1", 1, 'Library', {shelf: "mathematics"});
      conn.sendBinary.reset();
      //[
      // client stops the subscription
      conn.onSubscribe("sub1", 2);
      assert.isTrue(sub.isStopped);
      refute.called(conn.sendBinary); // no need to send to client
      //]
      assert.equals(conn._subs, {});
    });

    test("postMessage", ()=>{
      /**
       * Post `message` directly to the subscriber client. See {#../subscription#onMessage}

       * @param {any-type} message
       **/
      api.protoMethod();

      //[
      let sub;
      class Library extends Publication {
        init() {sub = this}
      }
      Library.pubName = 'Library';
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});

      sub.postMessage({my: "message"});
      //]
      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 0, {my: "message"}]);
    });

    test("onMessage", ()=>{
      /**
       * Called when a message has been sent from the subscription. Messages are used to alter the
       * state of a subscription. If an error is thrown the client callback will receive the error.
       *
       * See {#../subscription#postMessage}
       **/
      api.protoMethod();
      const Book = {where: ()=>({forEach: (cb) => {
        cb({_id: 'book2', attributes: {name: 'The Bone People', shelf: 'fiction'}});
      }})};
      //[
      let sub;
      class Library extends Publication {
        init(args) {
          this.args = args;
          sub = this;
        }
        onMessage(message) {//]
          super.onMessage(message); //[#
          const name = message.addShelf;
          if (name !== void 0) {
            this.args.shelf.push(name);
            Book.where({shelf: name}).forEach(doc =>{
              this.conn.sendBinary('A', ['Book', doc._id, doc.attributes]);
            });
            return "done :)";
          }
        }
      }
      Library.pubName = 'Library';
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});

      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 1, 200, m.number]);
      conn.sendBinary.reset();
      conn.onSubscribe("sub1", 2, null, {addShelf: "fiction"});

      assert.equals(conn.sendBinary.firstCall.args, [
        'A', ['Book', 'book2', {name: 'The Bone People', shelf: 'fiction'}]]);
      assert.equals(conn.sendBinary.lastCall.args, [
        'Q', ["sub1", 2, 0, "done :)"]]);
      //]
    });

    test("onMessage in TransQueue transaction success", ()=>{
      let inTrans = false;
      let sub;
      class Library extends Publication {
        init(args) {
          sub = this;
        }
        onMessage(message) {
          assert.isTrue(inTrans);
          return "done :)";
        }
      }
      Library.pubName = 'Library';
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});

      conn.sendBinary.reset();
      intercept(TransQueue, 'transaction', func =>{
        inTrans = true;
        try {
          return func();
        } finally {
          inTrans = false;
        }
      });
      conn.sendBinary.invokes(c => {
        assert.isFalse(inTrans);
      });
      conn.onSubscribe("sub1", 2, null, 'foo');
      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 2, 0, "done :)"]);
    });

    test("onMessage in TransQueue transaction failure", ()=>{
      let inTrans = false;
      let sub;
      class Library extends Publication {
        init(args) {
          sub = this;
        }
        onMessage(message) {
          assert.isTrue(inTrans);
          throw new koru.Error(404, 'not_found');
        }
      }
      Library.pubName = 'Library';
      conn.onSubscribe("sub1", 1, 'Library', {shelf: ["mathematics"]});

      conn.sendBinary.reset();
      intercept(TransQueue, 'transaction', func =>{
        inTrans = true;
        try {
          return func();
        } finally {
          inTrans = false;
        }
      });
      conn.sendBinary.invokes(c => {
        assert.isFalse(inTrans);
      });
      conn.onSubscribe("sub1", 2, null, 'foo');
      assert.calledWith(conn.sendBinary, 'Q', ["sub1", 2, -404, "not_found"]);
    });

    test("discreteLastSubscribed", ()=>{
      /**
       * Convert `time` to the lower `lastSubscribedInterval` boundry.
       *
       * @param time the time (in ms) to convert
       **/
      api.method();
      stubProperty(Publication, 'lastSubscribedInterval', 123);
      //[
      Publication.lastSubscribedInterval = 20*60*1000;

      assert.equals(
        Publication.discreteLastSubscribed(+new Date(2019, 0, 4, 9, 10, 11, 123)),
        +new Date(2019, 0, 4, 9, 0));
      //]
    });

    test("lastSubscribed", ()=>{
      /**
       * The subscriptions last successful subscription time in ms
       **/
      api.protoProperty();
      const thirtyDaysAgo = Date.now() - 30*util.DAY;
      const sub = new Publication({lastSubscribed: thirtyDaysAgo});
      assert.equals(new Date(sub.lastSubscribed), new Date(thirtyDaysAgo));
    });

    test("lastSubscribedInterval", ()=>{
      /**
       * Allow grouping subscription downloads to an interval bin so that subscriptions wanting
       * similar data can be satisfied with one pass of the database. Specified in
       * milliseconds. Defaults to 5mins.
       *
       * See {#.discreteLastSubscribed}
       **/
      api.property();
      assert.same(Publication.lastSubscribedInterval, 5*60*1000);
      after(()=>{Publication.lastSubscribedInterval = 5*60*1000});

      Publication.lastSubscribedInterval = 10*60*1000;
      assert.same(Publication.lastSubscribedInterval, 10*60*1000);
    });

    test("lastSubscribedMaximumAge", ()=>{
      /**
       * Any subscription with a lastSubscribed older than this is aborted with error 400, reason
       * `{lastSubscribed: "too_old"}`. Specified in milliseconds. Defaults to 180 days.
       *
       * Client subscriptions should not send a `lastSubscribed` value if it is not later than this
       * value, by at least 10000. It should also mark any current documents as simulated.
       **/
      api.property();

      class Library extends Publication {}
      Library.pubName = "Library";

      Library.lastSubscribedMaximumAge = 30 * util.DAY;

      assert.same(Library.lastSubscribedMaximumAge, 30 * util.DAY);

      let now = util.dateNow(); intercept(util, 'dateNow', ()=>now);

      conn.onSubscribe("sub1", 1, 'Library', void 0, now - 30 * util.DAY);
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub1', 1, 200, now]);

      conn.sendBinary.reset();
      conn.onSubscribe("sub2", 1, 'Library', void 0, now - 31 * util.DAY);
      assert.calledOnceWith(conn.sendBinary, 'Q', ['sub2', 1, 400, {lastSubscribed: "too_old"}]);
    });

    test("userId", ()=>{
      /**
       * userId is a short cut to `this.conn.userId`. See {#koru/session/server-connection}
       **/
      api.protoProperty();
      const conn = {userId: null};
      const sub = new Publication({conn});

      sub.userId = 'uid123';
      assert.same(conn.userId, 'uid123');
      conn.userId = 'uid456';
      assert.same(sub.userId, 'uid456');
    });

    test("userIdChanged", ()=>{
      /**
       * The default behavior is to do nothing. Override this if an userId change needs to be handled.
       **/
      after(()=>{util.thread.userId = void 0});
      api.protoMethod();
      //[
      class Library extends Publication {
        userIdChanged(newUID, oldUID) {//]
          super.userIdChanged(newUID, oldUID); //[#
          if (newUID === void 0) this.stop();
        }
      }
      Library.pubName = "Library";

      const sub = conn.onSubscribe("sub1", 1, "Library");
      spy(sub, 'stop');
      sub.conn.userId = "uid123";
      refute.called(sub.stop);
      sub.conn.userId = null;
      assert.called(sub.stop);
      //]
    });
  });
});
