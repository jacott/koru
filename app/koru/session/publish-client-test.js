isClient && define(function (require, exports, module) {
  /**
   * Register the client side of a publish function. The function is
   * called when {#koru/session/subscribe} is invoked and is
   * responsible for setting up matches which filter valid documents
   * sent from the server.
   **/
  const ClientSub    = require('koru/session/client-sub');
  const api          = require('koru/test/api');
  const Model        = require('../model/main');
  const util         = require('../util');
  const session      = require('./main');
  const stateFactory = require('./state').constructor;
  const TH           = require('./test-helper');

  const sut = require('./publish');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
      api.module();
      v.sess = {
        provide: test.stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = test.stub(),
      };
    },

    tearDown() {
      v.handles.forEach(h => {h.stop()});
      v = null;
    },

    "test preload"() {
      /**
       * If a publish function has a static method called preload it
       * will be called before the request is sent to the server.
       *
       * Useful actions to take in the preload are (but not limited to):

       * 1. modifiy the subcription argument list

       * 1. load data from client-side storage and

       * 1. call the subscription callback and clear it so not called
       * by server fulfillment
       **/

      const preload = api.custom(
        function preload(sub) {
          sub.args = [6, 7];
        }, 'preload', 'publish.preload = function preload(sub)');
      const subscribe = (name, ...args) => {
        v.sub = new ClientSub(v.sess, "1", name, args);
        v.sub.resubscribe();
      };

      this.onEnd(() => {sut._destroy("Books")});

      const publish = sut;
      api.example(() => {
        function publishBooks() {
          v.args = this.args;
        }
        publishBooks.preload = preload; // preload(sub) {sub.args = [6, 7];}
        publish("Books", publishBooks);
        subscribe('Books', 5);
        assert.equals(v.args, [6, 7]);
      });
    },

    "test filter Models"() {
      test.stub(session, 'sendM');
      v.F1 = Model.define('F1').defineFields({name: 'text'});
      v.F2 = Model.define('F2').defineFields({name: 'text'});

      var fdoc = v.F1.create({name: 'A'});
      v.F1.create({name: 'A'});
      var fdel = v.F1.create({name: 'X'});

      v.F2.create({name: 'A2'});
      v.F2.create({name: 'X2'});
      v.F2.create({name: 'X2'});

      v.handles.push(v.F1.onChange(v.f1del = test.stub()));

      v.handles.push(sut.match.register('F1', doc => doc.name === 'A'));


      v.handles.push(sut.match.register('F2', doc => doc.name === 'A2'));

      v.handles.push(v.F1._indexUpdate.onChange(v.f1idxOC = this.stub()));

      try {
        sut._filterModels({F1: true});

        assert.same(v.F1.query.count(), 2);
        assert.same(v.F2.query.count(), 3);

        assert.calledWith(v.f1del, null, TH.match.field('_id', fdel._id), true);
        assert.calledWith(v.f1idxOC, null, TH.match.field('_id', fdel._id));
        assert(v.f1idxOC.calledBefore(v.f1del));

        fdoc.attributes.name = 'X';

        sut._filterModels({F1: true, F2: true});

        assert.same(v.F1.query.count(), 1);
        assert.same(v.F2.query.count(), 1);

      } finally {
        Model._destroyModel('F1', 'drop');
        Model._destroyModel('F2', 'drop');
      };
    },

    "test false matches"() {
      v.handles.push(sut.match.register('Foo', doc => {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(sut.match.register('Foo', doc => {
        assert.same(doc, v.doc);
        return false;
      }));


      assert.isFalse(sut.match.has(v.doc));
    },


    "test true matches"() {
      v.handles.push(sut.match.register('Foo', doc => {
        assert.same(doc, v.doc);
        return false;
      }));

      v.handles.push(v.t = sut.match.register('Foo', doc => {
        assert.same(doc, v.doc);
        return true;
      }));


      assert.isTrue(sut.match.has(v.doc));
      v.t.stop();

      assert.isFalse(sut.match.has(v.doc));
    },
  });
});
