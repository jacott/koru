isClient && define((require, exports, module)=>{
  /**
   * Build a subscriber for a `session`.
   *
   * See {#koru/session/subscribe}
   **/
  const ClientSub    = require('koru/session/client-sub');
  const api          = require('koru/test/api');
  const koru         = require('../main');
  const Model        = require('../model/main');
  const login        = require('../user-account/client-login');
  const util         = require('../util');
  require('./client-update');
  const message      = require('./message');
  const publish      = require('./publish');
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');

  const {private$} = require('koru/symbols');

  const {stub, spy, onEnd, stubProperty, match: m} = TH;

  const subscribeFactory = require('./subscribe-factory');

  let v = {}, subscribe = null;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.gDict = message.newGlobalDict();

      TH.mockConnectState(v);
      subscribe = subscribeFactory(v.sess ={
        provide: stub(),
        unprovide: stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = stub(),
      });
      assert.calledWith(v.sess.provide, 'P', TH.match(func => {
        v.recvP = (...args) => {func.call(v.sess, args)};
        return true;
      }));
      ['A', 'C', 'R'].forEach(type => {
        assert.calledWith(v.sess.provide, type, TH.match(func => {
          v['recv'+type] = (...args) => {func(args)};
          return true;
        }));
      });

      spy(v.sess, 'sendP');

      v.pubFunc = stub();
      publish({name: "foo", init(...args) {
        v.pubFunc.apply(this, args);
      }});
    });

    afterEach(()=>{
      subscribe.unload();
      publish._destroy('foo');
      publish._destroy('foo2');
      v = {};
      subscribe = null;
    });

    test("sendP", ()=>{
      v.sessState.connected(v.sess);
      v.sess.sendP('id', 'foo', [1, 2, 'bar']);

      assert.calledWith(v.sendBinary, 'P', ['id', 'foo', [1, 2, 'bar']]);

      v.sess.sendP('12');

      assert.calledWith(v.sendBinary, 'P', ['12']);
    });

    test("_wait called before preload", ()=>{
      const preload = stub();
      stubProperty(publish._pubs.foo, 'preload', preload);
      const _wait = spy(ClientSub.prototype, '_wait');

      const sub1 = subscribe("foo", 1 ,2);

      assert(_wait.calledBefore(preload));
    });

    test("preload error", ()=>{
      const then = stub();
      const preload = stub().invokes(()=>({then}));
      stubProperty(publish._pubs.foo, 'preload', preload);

      const sub1 = subscribe("foo", 1 ,2);

      assert.calledWith(preload, sub1);

      spy(sub1, '_received');
      spy(sub1._subscribe, 'init');

      then.firstCall.args[1](v.err = {error: 'error'});
      assert.calledWith(sub1._received, v.err);
      refute.called(sub1._subscribe.init);
    });

    test("preload calls after sub closed", ()=>{
      const then = stub();
      const preload = stub().invokes(()=>({then}));
      stubProperty(publish._pubs.foo, 'preload', preload);
      const sub1 = subscribe("foo", 1 ,2);
      sub1.stop();
      then.yield();
      refute(sub1._id);
      assert.equals(v.sess.subs, {});

    });

    test("wait for onConnect", ()=>{
      const sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      v.sessState.connected(v.sess);

      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2], 0]);
    });

    test("not Ready", ()=>{
      v.sessState.connected(v.sess);
      v.sessState.close(false);

      const sub1 = subscribe("foo", 1 ,2);
      refute.called(v.sendBinary);

      sub1.lastSubscribed = 5432;

      v.sessState.connected(v.sess);
      assert.calledWith(v.sendBinary, 'P', [sub1._id, 'foo', [1, 2], 5432]);
    });

    test("build subscribe", ()=>{
      const sut = subscribeFactory;
      {
        const subscribeFactory = api.custom(sut);
        stub(v.sessState, 'onConnect');
        const mySession = v.sess;
        stubProperty(publish._pubs, 'Library', {value: {init: v.Library = stub()}});
        //[
        const subscribe = subscribeFactory(mySession);
        const sub = subscribe("Library");

        assert(sub instanceof ClientSub);
        //]
      }
    });

    test("resubscribe onConnect", ()=>{
      stub(v.sessState, 'onConnect');
      subscribe = subscribeFactory(v.sess);
      stub(v.sess, 'sendP');
      assert.calledWith(v.sessState.onConnect, "10-subscribe", subscribe._onConnect);

      publish({name: "foo2", init() {}});

      const sub1 = subscribe("foo", 1 ,2);
      const sub2 = subscribe("foo2", 3, 4);
      const sub3 = subscribe("foo2", 5, 6);

      v.sess.sendP.reset();
      sub1.waiting = false;

      const pendingCount = v.sessState.pendingCount();

      subscribe._onConnect(v.sess);

      assert.same(v.sessState.pendingCount(), pendingCount + 1);
      assert.isTrue(sub1.waiting);


      assert.calledWith(v.sess.sendP, sub1._id, 'foo', [1, 2]);
      assert.calledWith(v.sess.sendP, sub2._id, 'foo2', [3, 4]);
      assert.calledWith(v.sess.sendP, sub3._id, 'foo2', [5, 6]);
    });

    test("onChange rpc", ()=>{
      onEnd(v.sessState.pending.onChange(v.ob = stub()));

      assert.same(v.sessState.pendingCount(), 0);

      const sub1 = subscribe("foo", 1 ,2, v.sub1CB = stub());
      assert.isTrue(sub1.waiting);

      assert.calledOnceWith(v.ob, true);

      const sub2 = subscribe("foo", 3, 4);
      assert.calledOnce(v.ob);

      assert.same(v.sessState.pendingCount(), 2);

      v.ob.reset();

      v.recvP(sub1._id);
      assert.isFalse(sub1.waiting);

      assert.calledOnce(v.sub1CB);
      assert.isNull(sub1.callback);

      refute.called(v.ob);

      v.recvP(sub2._id);

      assert.calledWith(v.ob, false);

      assert.same(v.sessState.pendingCount(), 0);
    });

    group("filtering", ()=>{
      beforeEach(()=>{
        stub(publish, '_filterModels');
        publish({
          name: "foo2",
          init() {
            this.match('F1', stub());
            this.match('F2', stub());
          },
          resubscribe(sub) {
            v.sub2isResub = true;
          }
        });
      });

      /*
       * All subscriptions should be resubscribed
       */
      test("change userId", ()=>{
        v.sub = subscribe('foo', 123, 456);
        const sub2 = subscribe('foo2', 2);

        assert.same(v.pubFunc.firstCall.thisValue, v.sub);
        assert.calledWith(v.pubFunc, 123, 456);
        v.pubFunc.reset();

        refute(v.sub2isResub);

        login.setUserId(v.sess, util.thread.userId); // no userId change
        refute.called(v.pubFunc);

        subscribe._userId = null;

        login.setUserId(v.sess, util.thread.userId);

        refute.called(v.pubFunc);

        assert.isTrue(v.sub2isResub);

        assert.calledWith(publish._filterModels, {F1: true, F2: true});
      });
    });

    test("error on resubscribe", ()=>{
      v.sub = subscribe('foo', 'x');
      stub(koru, 'error');
      v.sub._subscribe.resubscribe = () => {throw new Error('foo error')};

      ClientSub[private$].resubscribe(v.sub, {});

      refute(v.sub.isResubscribe);
      assert.calledWith(koru.error, TH.match(/foo error/));
    });



    /**
     * sub.userId should mirror koru.userId
     */
    test("userId", ()=>{
      v.sub = subscribe('foo', 123, 456, v.stub = stub());
      const origId = koru.util.thread.userId;
      onEnd(() => {koru.util.thread.userId = origId});
      koru.util.thread.userId = 'test123';

      assert.same(v.sub.userId, 'test123');
    });

    test("stop before result", ()=>{
      v.sub = subscribe('foo', 123, 456, v.stub = stub());
      spy(v.sessState, "decPending");
      v.sub.stop();
      assert.called(v.sessState.decPending);
      v.sub.stop();
      assert.calledOnce(v.sessState.decPending);
    });

    test("subscribe", ()=>{
      v.sub = subscribe('foo', 123, 456, v.stub = stub());

      assert.calledOnce(v.pubFunc);
      assert.same(v.pubFunc.firstCall.thisValue, v.sub);


      assert.same(v.sub._id, subscribe._nextId.toString(36));
      assert.same(v.sub.callback, v.stub);
      assert.equals(v.sub.args, [123, 456]);

      v.recvP(v.sub._id, 200, 87654321);

      assert.calledWithExactly(v.stub, null);

      assert.calledWith(v.sess.sendP, v.sub._id, 'foo', [123, 456]);
      assert(v.sub);

      assert.same(subscribe._subs[v.sub._id], v.sub);

      const subId = v.sub._id;
      v.sub.stop();
      assert.calledWith(v.sess.sendP, subId);
      assert.isTrue(v.sub.isStopped());

      assert.isFalse(subId in subscribe._subs);
      assert.isNull(v.sub._id);

      v.sess.sendP.reset();
      v.sub.stop();
      refute.called(v.sess.sendP);

      v.sub = null;
    });

    test("callback on error",  ()=>{
      v.sub = subscribe('foo', 123, 456, v.stub = stub());
      refute.called(v.stub);
      v.recvP(v.sub._id, 304, "error msg");
      v.recvP(v.sub._id, 304, "error msg");
      assert.calledOnceWith(v.stub, [304, "error msg"]);
    });

    test("remote stop while waiting", ()=>{
      v.sub = subscribe('foo', 123, 456, v.stub = stub());

      assert(v.sub.waiting);

      v.sess.sendP.reset();

      v.recvP(v.sub._id, false);

      assert.isNull(v.sub._id);

      refute.called(v.sess.sendP);
    });

    group("remove stop", ()=>{
      beforeEach(()=>{
        v.sub = subscribe('foo', 123, 456, v.stub = stub());
      });

      test("while waiting", ()=>{
        assert(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      });

      test("while not waiting", ()=>{
        v.recvP(v.sub._id);
        refute(v.sub.waiting);

        v.sess.sendP.reset();
        v.recvP(v.sub._id, false);

        assert.isNull(v.sub._id);
        refute.called(v.sess.sendP);
      });
    });

    group("match", ()=>{
      beforeEach(()=>{
        v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
        onEnd(() => {Model._destroyModel('Foo', 'drop')});
      });

      test("onStop", ()=>{
        v.sub = subscribe('foo');

        v.sub.onStop(v.onstop = stub());

        v.sub.stop();

        assert.called(v.onstop);

        v.sub.stop();

        assert.calledOnce(v.onstop);
      });

      test("resubscribe", ()=>{

        stub(v.sessState, 'isReady').returns(true);
        v.pubFunc = function () {
          this.lastSubscribed = 12345678;
          this.match(v.Foo, stub());
          this.match("Bar", stub());
        };

        v.sub = subscribe('foo');

        /** pubFunc is called before sent to server **/
        assert.calledWith(v.sendBinary, 'P', ['1', 'foo', [], 12345678]);

        v.sub._subscribe.resubscribe = function (sub) {
          sub.match("Baz", v.match = stub());
          sub.match("Biz", stub());
        };

        const models = {};
        ClientSub[private$].resubscribe(v.sub, models);

        assert.equals(Object.keys(models).sort(), ['Bar', 'Baz', 'Biz', 'Foo']);

      });
    });
  });
});
