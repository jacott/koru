define((require, exports, module) => {
  'use strict';
  const Future          = require('koru/future');
  const TH              = require('koru/test-helper');
  const koru            = require('./main');

  const {stub, spy} = TH;

  const Queue = require('./queue');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('single serial', async () => {
      let func;
      const single = Queue('single');
      await single.add(func = stub());
      assert.called(func);
      await single.add(func = stub());
      assert.called(func);
    });

    test('single pending', async () => {
      const single = Queue('single');
      const f1 = new Future();
      const f2 = new Future();
      const f3 = new Future();
      const p1 = single.add(f1.func = stub(async () => {await f1.promise}));
      const p2 = single.add(f2.func = stub(async () => {await f2.promise}));
      const p3 = single.add(f3.func = stub(async () => {await f3.promise}));

      assert(single.isPending);
      assert(single.head);
      assert(single.tail);
      assert(single.head !== single.tail);

      f1.resolve();
      assert.called(f1.func);
      refute.called(f2.func);

      await p1;
      assert(single.head === single.tail);
      f2.resolve();
      assert.called(f2.func);
      refute.called(f3.func);
      assert(single.isPending);

      await p2;
      assert.same(single.head, void 0);
      assert.same(single.tail, void 0);
      refute(single.isPending);
      assert.called(f3.func);
      f3.resolve();

      await p3;
      refute(single.isPending);
    });

    test('queing', async () => {
      const q2 = new Future();
      const q3 = new Future();
      const fooFin = new Future();
      const results = [];
      const queue = Queue();

      const letRun = (func) => {
        koru.runFiber(func);
        const f = new Future();
        setTimeout(() => {f.resolve()}, 1);
        return f.promise;
      };

      await queue('foo', async (fooQueue) => {
        assert.isFalse(fooQueue.isPending);
        await letRun(async () => {
          await queue('foo', async () => {
            await letRun(async () => {
              try {
                await queue('foo', async () => {
                  results.push(3);
                  await queue('bar', () => {throw 'ex bar'});

                  results.push('not me');
                });
              } catch (ex) {
                results.push(ex.toString());
                q3.resolve();
              }
            });
            results.push(await queue('bar', () => 'bar'));
            results.push(2);
            q2.resolve();
          });
        });
        assert.isTrue(fooQueue.isPending);
        results.push(1);
      });
      await q2.promise;
      await q3.promise;
      assert.equals(results, [1, 'bar', 2, 3, 'ex bar']);

      let fooNew = false;
      await queue('foo', () => {fooNew = true});

      assert.isTrue(fooNew);
    });
  });
});
