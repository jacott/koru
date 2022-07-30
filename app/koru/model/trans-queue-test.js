define((require, exports, module) => {
  'use strict';
  /**
   * Run code within a transaction.
   **/
  const Model           = require('koru/model/main');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const TransQueue = require('./trans-queue');
  const sut = TransQueue;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let TestModel;
    before(() => {
      TestModel = Model.define('TestModel').defineFields({name: 'text'});
    });

    after(async () => {
      await Model._destroyModel('TestModel', 'drop');
      util.thread.date = void 0;
    });

    test('transaction', () => {
      /**
       * Start a transaction.  On server the transaction is linked to `util.thread` and a DB
       * transaction can also be attached. On client only one transaction can be running.

       * @param {koru/pg/driver::Client} [db] an optional database connection which has a
       * `transaction` method.

       * @param {function} body the function to run within the transaction.
       **/
      api.method();
      //[
      let inTrans = false;
      TransQueue.transaction(() => {
        inTrans = TransQueue.isInTransaction();
      });
      assert.isTrue(inTrans);
      //]
    });

    test('nonNested', async () => {
      api.method();
      //[
      let level = -1;
      await TransQueue.nonNested(TestModel, async () => {
        assert.isTrue(TransQueue.inTransaction);
        await TransQueue.nonNested(TestModel, () => {
          level = isClient ? 0 : TestModel.db.existingTran.savepoint;
        });
      });
      assert.same(level, 0);
      //]
    });

    test('isInTransaction', () => {
      /**
       * Test if currently in a transaction.
       **/
      api.method();
      //[
      assert.isFalse(TransQueue.isInTransaction());
      TransQueue.transaction(() => {
        assert.isTrue(TransQueue.isInTransaction());
      });
      assert.isFalse(TransQueue.isInTransaction());
      //]
    });

    test('isInTransaction async', async () => {
      api.method();
      //[
      assert.isFalse(TransQueue.isInTransaction());
      await TransQueue.transaction(async () => {
        await 1;
        assert.isTrue(TransQueue.isInTransaction());
      });
      assert.isFalse(TransQueue.isInTransaction());
      //]
    });

    test('onSuccess', () => {
      /**
       * Register a function to be called if the most outer transaction finishes successfully or if
       * no transaction is running.

       * @param func the function to run on success.
       **/
      api.method();
      const func1 = stub();
      TransQueue.transaction(() => {
        TransQueue.transaction(() => {
          TransQueue.onSuccess(func1);
        });
        refute.called(func1);   // not called until outer transaction finishes
      });
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.onSuccess(func1); // called now since no transaction
      assert.calledOnce(func1);

      func1.reset();
      try {
        TransQueue.transaction(() => {
          TransQueue.onSuccess(func1);
          throw 'abort';
        });
      } catch (ex) {
        if (ex !== 'abort') throw ex;
      }
      refute.called(func1);     // not called since transaction aborted
    });

    test('onAbort', () => {
      /**
       * Register a function to be called if the most outer transaction aborts.

       * @param func the function to run only if aborted.
       **/
      api.method();
      const func1 = stub();
      try {
        TransQueue.transaction(() => {
          try {
            TransQueue.transaction(() => {
              TransQueue.onAbort(func1);
              throw 'abort';
            });
          } finally {
            refute.called(func1);   // not called until outer transaction finishes
          }
        });
      } catch (ex) {
        if (ex !== 'abort') throw ex;
      }
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.transaction(() => {
        TransQueue.onAbort(func1);
      });
      refute.called(func1);
    });

    test('finally', () => {
      /**
       * Register a function to be called when the most outer transaction finishes either
       * successfully or by aborting.

       * @param func the function to run on transaction end.
       **/
      api.method();
      const func1 = stub();
      try {
        TransQueue.transaction(() => {
          try {
            TransQueue.transaction(() => {
              TransQueue.finally(func1);
              throw 'abort';
            });
          } finally {
            refute.called(func1);   // not called until outer transaction finishes
          }
        });
      } catch (ex) {
        if (ex !== 'abort') throw ex;
      }
      assert.calledOnce(func1);

      func1.reset();
      TransQueue.transaction(() => {
        TransQueue.finally(func1);
      });
      assert.calledOnce(func1);
    });

    test('async finally', async () => {
      const order = [];
      const func1 = async () => {await 1; order.push(1)};
      const func2 = () => {order.push(2)};
      const func3 = async () => {await 1; order.push(3)};
      await TransQueue.transaction(async () => {
        TransQueue.finally(func1);
        TransQueue.finally(func2);
        TransQueue.finally(func3);
      });
      assert.equals(order, [1, 2, 3]);
    });

    isClient && test('success', () => {
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub();
      const fin1 = stub();

      const now = util.thread.date = Date.now();
      after(() => {util.thread.date = void 0});

      sut._clearLastTime();

      assert.isFalse(sut.isInTransaction());

      const result = sut.transaction(TestModel, () => {
        assert.isTrue(sut.isInTransaction());
        assert.same(now, util.dateNow());
        sut.onAbort(err1);
        sut.onSuccess(stub1);
        sut.transaction(TestModel, () => sut.onSuccess(() => {
          sut.finally(fin1);
          assert.same(now, util.dateNow()); // ensure same time as top transaction

          sut.onSuccess(stub2); // double nested should still fire
          assert.isTrue(sut.isInTransaction());
          refute.called(stub2);
        }));
        refute.called(stub1);
        refute.called(stub2);
        refute.called(fin1);
        return 'success';
      });

      assert.same(now, util.dateNow());

      assert.same(result, 'success');
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));
      refute.called(err1);

      assert.called(fin1);

      stub1.reset();
      stub2.reset();

      sut.transaction(TestModel, () => {
        assert.same(now + 1, util.dateNow()); // ensure time unique to transaction

        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    });

    test('success async', async () => {
      const order = [];
      const stub1 = stub(async () => {
        order.push('s1a');
        await 1;
        order.push('s1b');
      });

      const stub2 = stub(async () => {
        order.push('s2a');
        await 2;
        order.push('s2b');
      });
      const err1 = stub();
      const fin1 = stub(async () => {
        order.push('f1a');
        await 1;
        order.push('f1b');
      });

      const now = util.thread.date = Date.now();
      after(() => {util.thread.date = void 0});

      sut._clearLastTime();

      assert.isFalse(sut.isInTransaction());

      const result = await sut.transaction(TestModel, async () => {
        await 1;
        assert.isTrue(sut.isInTransaction());
        assert.same(now, util.dateNow());
        sut.onAbort(err1);
        sut.onSuccess(stub1);
        await sut.transaction(TestModel, () => sut.onSuccess(async () => {
          await 1;
          sut.finally(fin1);
          assert.same(now, util.dateNow()); // ensure same time as top transaction

          sut.onSuccess(stub2); // double nested should still fire
          assert.isTrue(sut.isInTransaction());
          refute.called(stub2);
        }));
        refute.called(stub1);
        refute.called(stub2);
        refute.called(fin1);
        return 'success';
      });

      assert.same(now, util.dateNow());

      assert.same(result, 'success');
      assert.called(stub1);
      assert(stub2.calledAfter(stub1));
      refute.called(err1);

      assert.called(fin1);

      stub1.reset();
      stub2.reset();

      await sut.transaction(TestModel, () => {
        assert.same(now + 1, util.dateNow()); // ensure time unique to transaction

        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
      assert.equals(order, ['s1a', 's1b', 's2a', 's2b', 'f1a', 'f1b', 's1a', 's1b']);
    });

    test('no db', () => {
      assert.same(sut.transaction(() => 'result'), 'result');
    });

    test('simple success', async () => {
      assert.same(await sut.transaction(TestModel, () => 'result'), 'result');
    });

    test('simple exception', async () => {
      try {
        await sut.transaction(TestModel, () => {throw new Error('an error')});
        assert.fail('expect throw');
      } catch (err) {
        assert.exception(err, {message: 'an error'});
      }
    });

    test('onSuccess in onSuccess', async () => {
      await sut.transaction(() => {
        sut.onSuccess(() => {
          assert(sut.isInTransaction);
        });
      });
    });

    isClient && test('exception', () => {
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub();
      const err2 = stub();
      const err3 = stub();
      const fin1 = stub();
      const fin2 = stub();

      assert.exception(() => sut.transaction(TestModel, () => {
        sut.onAbort(err1);
        sut.onAbort(err2);
        sut.onSuccess(stub1);
        sut.finally(fin1);
        sut.transaction(TestModel, () => {
          sut.onSuccess(stub2);
          try {
            sut.transaction(TestModel, () => {
              sut.finally(fin2);
              sut.onAbort(err3);
              throw new Error('err3');
            });
          } catch (ex) {}
        });
        refute.called(fin1);
        refute.called(fin2);
        // err3 should not be called
        throw new Error('an error: ' + err3.called);
      }), {message: 'an error: false'});

      refute.called(stub1);
      refute.called(stub2);

      assert.called(err1);
      assert.called(err2);
      assert.called(err3);
      assert.called(fin1);
      assert.called(fin2);

      sut.transaction(TestModel, () => {
        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    });

    test('exception async', async () => {
      const order = [];
      const stub1 = stub();
      const stub2 = stub();
      const err1 = stub(async () => {
        order.push('e1a');
        await 1;
        order.push('e1b');
      });
      const err2 = stub(async () => {
        order.push('e2a');
        await 1;
        order.push('e2b');
      });
      const err3 = stub(async () => {
        order.push('e3a');
        await 1;
        order.push('e3b');
      });
      const fin1 = stub(async () => {
        order.push('f1a');
        await 1;
        order.push('f1b');
      });
      const fin2 = stub(() => {
        order.push('fin2');
      });

      try {
        await sut.transaction(TestModel, async () => {
          await 1;
          sut.onAbort(err1);
          sut.onAbort(err2);
          sut.onSuccess(stub1);
          sut.finally(fin1);
          await sut.transaction(TestModel, async () => {
            await 1;
            sut.onSuccess(stub2);
            try {
              await sut.transaction(TestModel, async () => {
                await 1;
                sut.finally(fin2);
                sut.onAbort(err3);
                throw new Error('err3');
              });
            } catch (ex) {}
          });
          refute.called(fin1);
          refute.called(fin2);
          // err3 should not be called
          throw new Error('an error: ' + err3.called);
        });
        assert.fail('expect throw');
      } catch (err) {
        assert.exception(err, {message: 'an error: false'});
      }

      refute.called(stub1);
      refute.called(stub2);

      assert.called(err1);
      assert.called(err2);
      assert.called(err3);
      assert.called(fin1);
      assert.called(fin2);

      await sut.transaction(TestModel, () => {
        sut.onSuccess(stub1);
      });

      assert.called(stub1);
      refute.called(stub2);
    });

    test('no transaction', () => {
      const stub1 = stub();

      sut.onSuccess(stub1);

      assert.called(stub1);

      const stub2 = stub();
      sut.finally(stub2);

      assert.called(stub2);
    });
  });
});
