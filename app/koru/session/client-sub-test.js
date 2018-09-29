isClient && define((require, exports, module)=>{
  /**
   * A subscription to a publication
   *
   * ##### Construction
   *
   * See {#koru/session/subscribe}
   **/
  const Model           = require('koru/model');
  const Query           = require('koru/model/query');
  const publish         = require('koru/session/publish');
  const api             = require('koru/test/api');
  const stateFactory    = require('./state').constructor;
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, intercept} = TH;

  const ClientSub    = require('./client-sub');

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.sess = {
        provide: stub(),
        state: v.sessState = stateFactory(),
        _rpcs: {},
        _commands: {},
        sendBinary: v.sendBinary = stub(),
        subs: {},
      };
      api.module({
        initInstExample: `
          const subscribe = ${'require'}('koru/session/subscribe');
          const clientSub = subscribe("Library");`
      });
    });

    afterEach(()=>{
      v = {};
    });

    test("no longer waiting when decPending", ()=>{
      const sub = new ClientSub(v.sess, "1", "Library", []);
      let incCount = 0, decCount = 0;
      intercept(v.sess.state, 'incPending', ()=>{
        ++incCount;
        assert.isTrue(sub.waiting);
      });
      intercept(v.sess.state, 'decPending', ()=>{
        ++decCount;
        assert.isFalse(sub.waiting);
      });

      sub._wait();
      sub._received(200);

      assert.same(incCount, 1);
      assert.same(decCount, 1);
    });

    test("onResponse", ()=>{
      /**
       * Use this instead of passing a callback to subscribe to be notified each time the server
       * responds to a connection request.
       *
       * See also {##onFirstResponse}
       *
       * @param callback first arg is an error is subscribe failed
       **/
      api.protoMethod('onResponse');
      const sub = new ClientSub(v.sess, "1", "Library", []);
      sub.onResponse(v.cb = stub());
      sub._wait();
      assert.isTrue(sub.waiting);

      sub._received(200);
      assert.isFalse(sub.waiting);
      assert.calledOnceWith(v.cb, null);

      sub._wait();
      sub._received(200);
      assert.calledTwice(v.cb);

      sub._wait();
      sub._received('error', "explaination");
      assert.calledThrice(v.cb);
      assert.calledWith(v.cb, ['error', "explaination"]);

      sub._wait();
      sub._received('error');
      assert.calledThrice(v.cb);
    });

    test("onFirstResponse", ()=>{
      /**
       * Same as passing a callback to subscribe to be notified the first time the server responds
       * to a connection request.
       *
       * See also {##onResponse}
       *
       * @param callback first arg is an error is subscribe failed
       **/
      api.protoMethod('onFirstResponse');
      const sub = new ClientSub(v.sess, "1", "Library", []);
      sub.onFirstResponse(v.cb = stub());
      sub._wait();
      assert.isTrue(sub.waiting);

      sub._received(200, 87654321);
      assert.isFalse(sub.waiting);
      assert.same(sub.lastSubscribed, 87654321);

      assert.calledOnceWith(v.cb, null);

      sub._wait();
      sub._received(200);
      assert.calledOnce(v.cb);
    });

    test("#match", ()=>{
      /**
       * Register a match function used to check if a document should
       * be in the database.
       **/
      api.protoMethod('match');

      class Book extends Model.BaseModel {
        static get modelName() {return 'Book'}
      }

      const regBook = stub(publish.match, "register").withArgs('Book', TH.match.func)
              .returns("registered Book");
      const sub1 = new ClientSub(v.sess, "1", "Library", []);


      sub1.match(Book, doc => /lord/i.test(doc.name));

      assert.equals(sub1._matches, {Book: 'registered Book'});
      assert.isTrue(regBook.args(0, 1)({name: "Lord of the Flies"}));
    });

    /**
     * Ensure when we stop that all docs the subscription doesn't want are removed if matched
     * elsewhere
     */
    test("remove unwanted docs", ()=>{
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
      const doc1 = Book.create({_id: 'doc1'});
      const doc2 = Book.create({_id: 'doc2'});
      const doc3 = Book.create({_id: 'doc3'});

      const mr = publish.match.register('Book', (doc, reason) =>{
        assert.same(reason, 'stopped');

        return doc === doc2;
      });
      onEnd(()=>{mr.delete()});

      const sub = new ClientSub(v.sess, "1", "Library", []);
      sub.onStop((sub, unmatch)=>{
        unmatch(doc1);
        unmatch(doc2);
      });

      sub.session = {
        subs: {[sub._id]: sub},
        sendP: stub(),
      };

      sub.stop.call({}); // ensure binding

      assert.equals(simDocs, {doc2: ['del']});

      refute(Book.findById('doc1'));
      assert(Book.findById('doc2'));
      assert(Book.findById('doc3'));
    });

    test("filterModels", ()=>{
      /**
       * Remove model documents that do not match this subscription
       **/
      api.protoMethod();

      stub(publish, '_filterModels');
      const sub1 = new ClientSub(v.sess, "1", "Library", []);

      sub1.filterModels('Book', 'Catalog');

      assert.calledWithExactly(publish._filterModels, {Book: true, Catalog: true});

      publish._filterModels.reset();
      v.sess.sendP = stub();

      const bookMatch = ()=>{};
      sub1.match('Book', bookMatch);

      sub1.stop();

      refute.called(publish._filterModels);
    });
  });
});
