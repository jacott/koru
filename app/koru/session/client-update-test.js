isClient && define((require, exports, module)=>{
  const dbBroker        = require('koru/model/db-broker');
  const Model           = require('../model/main');
  const Query           = require('../model/query');
  const TH              = require('../model/test-helper');
  const util            = require('../util');
  const clientUpdate    = require('./client-update');
  const session         = require('./main');
  const message         = require('./message');

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
    });

    afterEach(()=>{
      Model._destroyModel('Foo', 'drop');
      dbBroker.clearDbId();
      delete Model._databases.foo01;
      v = {};
    });

    test("added", ()=>{
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

      v.recvC('Foo', 'f222', v.attrs = {age: 7});
      v.recvC('Foo', 'f333', v.attrs = {age: 9});

      assert.equals(bob.attributes, {_id: 'f222', name: 'bob', age: 7});
      assert.equals(sam.attributes, {_id: 'f333', name: 'sam', age: 9});
    });

    test("remove", ()=>{
      const foo = v.Foo.create({_id: 'f222', name: 'bob', age: 5});
      const sam = v.Foo.create({_id: 'f333', name: 'sam', age: 5});

      v.recvR('Foo', 'f222');

      refute(v.Foo.findById('f222'));
      assert(v.Foo.findById('f333'));
    });
  });
});
