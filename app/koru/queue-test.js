isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const koru            = require('./main');

  const {stub, spy} = TH;

  const {Future} = util;

  const Queue = require('./queue');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      v = {};
    });

    test('single', () => {
      const single = Queue('single');
      single.add(v.func = stub());
      assert.called(v.func);
      single.add(v.func = stub());
      assert.called(v.func);
    });

    test('queing', () => {
      const q2 = new Future();
      const q3 = new Future();
      const fooFin = new Future();
      const results = [];
      const queue = Queue();

      const letRun = (func) => {
        koru.Fiber(func).run();
        const f = new Future();
        setTimeout(() => {f.return(v.q1)}, 1);
        f.wait();
      };

      queue('foo', (fooQueue) => {
        assert.isFalse(fooQueue.isPending);
        letRun(() => {
          queue('foo', () => {
            letRun(() => {
              try {
                queue('foo', () => {
                  results.push(3);
                  queue('bar', () => {throw 'ex bar'});

                  results.push('not me');
                });
              } catch (ex) {
                results.push(ex.toString());
                q3.return();
              }
            });
            results.push(queue('bar', () => 'bar'));
            results.push(2);
            q2.return();
          });
        });
        assert.isTrue(fooQueue.isPending);
        results.push(1);
      });
      q2.wait();
      q3.wait();
      assert.equals(results, [1, 'bar', 2, 3, 'ex bar']);

      queue('foo', () => {v.fooNew = true});

      assert.isTrue(v.fooNew);
    });
  });
});
