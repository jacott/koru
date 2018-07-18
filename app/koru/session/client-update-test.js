isClient && define((require, exports, module)=>{
  const dbBroker        = require('koru/model/db-broker');
  const Model           = require('../model/main');
  const Query           = require('../model/query');
  const TH              = require('../model/test-helper');
  const util            = require('../util');
  const clientUpdate    = require('./client-update');
  const session         = require('./main');
  const message         = require('./message');
  const publish         = require('./publish');

  const {stub, spy, onEnd} = TH;

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.gDict = message.newGlobalDict();
      clientUpdate(v.sess = {
        provide: stub(),
        _rpcs: {},
        sendBinary: v.sendBinary = stub(),
        state: 'ready',
        onConnect: stub(),
      });
      ['A', 'C', 'R'].forEach(type =>{
        assert.calledWith(v.sess.provide, type, TH.match(func => {
          v['recv'+type] = (...args) => {func.call(v.sess, args.slice())};
          return true;
        }));
      });

      v.Foo = Model.define('Foo').defineFields({name: 'text', age: 'number'});
      v.matchFunc = stub(publish.match, 'has', doc => doc.constructor === v.Foo &&
                         v.match(doc.attributes));
      v.match = doc => doc.name === 'bob';
    });

    afterEach(()=>{
      Model._destroyModel('Foo', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo01;
      v = {};
    });

    test("isFromServer", ()=>{
      stub(Query.prototype, 'remove', function () {
        assert.isTrue(v.sess.isUpdateFromServer);
        assert.isTrue(this.isFromServer);
      });

      v.recvC('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

      assert.isFalse(v.sess.isUpdateFromServer);
      assert.calledOnce(Query.prototype.remove);

      v.recvR('Foo', 'f123');

      assert.calledTwice(Query.prototype.remove);
    });

    test("added", ()=>{
      v.recvA('Foo', 'f123', v.attrs = {name: 'sam', age: 5});

      refute(v.Foo.findById('f123')); // only interested in bob

      const insertSpy = spy(Query, 'insertFromServer');
      v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 5});

      const foo = v.Foo.findById('f123');

      assert(foo);
      v.attrs._id = 'f123';
      assert.equals(foo.attributes, v.attrs);
      assert.calledWith(insertSpy, v.Foo, 'f123', v.attrs);

      v.sess._id = 'foo01';
      v.recvA('Foo', 'f123', v.attrs = {name: 'bob', age: 7});

      {
        const foo = v.Foo.findById('f123');

        assert.same(foo.age, 5);
        assert.same(v.Foo.query.withDB('foo01').fetchOne().age, 7);
      }
    });

    test("changed", ()=>{
      v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      const sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      const bob = v.Foo.docs.f222;

      bob.$cache.foo = 1;

      v.recvC('Foo', 'f222', v.attrs = {age: 7});
      v.recvC('Foo', 'f333', v.attrs = {age: 7});

      assert.equals(bob.$cache, {});

      assert.equals(bob.attributes, {_id: 'f222', name: 'bob', age: 7});
      assert.same(v.Foo.query.onId('f333').count(1), 0);
    });

    test("changing non existant doc", ()=>{
      const remove = spy(Query.prototype, 'remove');

      v.recvC('Foo', 'f222', v.attrs = {age: 7});
      assert.called(remove);

      assert.same(remove.firstCall.thisValue.singleId, 'f222');

    });

    test("remove", ()=>{
      const foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      const sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      v.recvR('Foo', 'f222');
      v.recvR('Foo', 'f333');

      refute(v.Foo.findById('f222'));
      refute(v.Foo.findById('f333')); // doesn't matter if it doesn't match; it's gone
    });
  });
});
