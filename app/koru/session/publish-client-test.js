define((require, exports, module)=>{
  const DocChange       = require('koru/model/doc-change');
  const ClientSub       = require('koru/session/client-sub');
  const api             = require('koru/test/api');
  const Model           = require('../model/main');
  const util            = require('../util');
  const session         = require('./main');
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, match: m} = TH;

  const publish = require('./publish');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.handles = [];
      v.doc = {constructor: {modelName: 'Foo'}};
      api.module({subjectModule: module.get('./publish')});
      v.sess = {
        provide: stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = stub(),
      };
    });

    afterEach(()=>{
      v.handles.forEach(h => {h.stop ? h.stop() : h.delete ? h.delete() : h()});
      v = {};
    });

    test("preload", ()=>{
      /**
       * If a publish has a preload function it will be called before
       * any subscription requests are sent to the server. If that
       * preload method returns a `Promise` then the subscription will
       * pause until the promise is fulfilled.
       *
       * Useful actions to take in the preload are (but not limited to):

       * 1. modifiy the subcription argument list

       * 1. load data from client-side storage and

       * 1. call the subscription callback and clear it so not called
       * by server fulfillment
       **/

      const preload = api.method("preload");

      const subscribe = (name, ...args) => {
        v.sub = new ClientSub(v.sess, "1", name, args);
        publish.preload(v.sub, err => {
          assert.same(err, undefined);
          v.sub.resubscribe();
        });
      };

      function loadBooksFromIndexedDB() {
        return {then(f) {f("ignore_this"); return this}};
      }

      onEnd(() => {publish._destroy("Books")});

      //[
      publish({
        name: "Books",
        init() {v.args = this.args},
        preload(sub) {
          return loadBooksFromIndexedDB(this.args).then(() => {
            sub.args = [6, 7];
          });
        },
      });
      subscribe('Books', 5);
      assert.equals(v.args, [6, 7]);
      //]
    });

    test("filter Models", ()=>{
      stub(session, '_sendM');
      const F1 = Model.define('F1').defineFields({name: 'text'});
      const F2 = Model.define('F2').defineFields({name: 'text'});

      const fdoc = F1.create({name: 'A'});
      F1.create({name: 'A'});
      const fdel = F1.create({name: 'X'});
      const f1del = stub(), f1idxOC = stub();

      F2.create({name: 'A2'});
      const x21 = F2.create({name: 'X2'});
      F2.create({name: 'X2'});

      v.handles.push(F1.onChange(f1del));
      v.handles.push(publish.match.register('F1', (doc, reason) => {
        v.reason = reason;
        return doc.name === 'A';
      }));
      v.handles.push(publish.match.register('F2', doc => doc.name === 'A2'));
      v.handles.push(F1._indexUpdate.onChange(f1idxOC));

      try {
        publish._filterModels({F1: true});

        assert.same(F1.query.count(), 2);
        assert.same(F2.query.count(), 3);

        const dc = DocChange.delete(fdel, 'noMatch');

        assert.calledWith(f1del, dc);
        assert.calledWith(f1idxOC, dc);

        assert.same(v.reason, 'noMatch');

        assert(f1idxOC.calledBefore(f1del));

        fdoc.attributes.name = 'X';

        const f2oc = stub();
        v.handles.push(F2.onChange(f2oc));

        publish._filterModels({F1: true, F2: true}, 'stopped');

        assert.same(F1.query.count(), 1);
        assert.same(F2.query.count(), 1);

        assert.calledWith(f2oc, DocChange.delete(x21, 'stopped'));

      } finally {
        Model._destroyModel('F1', 'drop');
        Model._destroyModel('F2', 'drop');
      };
    });

    group("match register", ()=>{
      test("false", ()=>{
        /**
         * Register functions to test if record is expected to be published
         *
         * See {#koru/session/match}
         **/
        api.property("match");

        v.handles.push(publish.match.register('Foo', doc => {
          assert.same(doc, v.doc);
          return false;
        }));

        v.handles.push(publish.match.register('Foo', doc => {
          assert.same(doc, v.doc);
          return false;
        }));


        assert.isFalse(publish.match.has(v.doc));
      });


      test("true", ()=>{
        v.handles.push(publish.match.register('Foo', doc => {
          assert.same(doc, v.doc);
          return false;
        }));

        v.handles.push(v.t = publish.match.register('Foo', doc => {
          assert.same(doc, v.doc);
          return true;
        }));


        assert.isTrue(publish.match.has(v.doc));
        v.t.delete();

        assert.isFalse(publish.match.has(v.doc));
      });
    });
  });
});
