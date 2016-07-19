isServer && define(function (require, exports, module) {
  var test, v;
  const koru   = require('./main');
  const Queue  = require('./queue');
  const TH     = require('./test');
  const Future = requirejs.nodeRequire('fibers/future');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test single"() {
      var single = Queue('single');
      single.add(v.func = test.stub());
      assert.called(v.func);
      single.add(v.func = test.stub());
      assert.called(v.func);
    },

    "test queing"() {
      var q2 = new Future;
      var q3 = new Future;
      var fooFin = new Future;
      var results = [];
      var queue = Queue();
      queue('foo', function (fooQueue) {
        assert.isFalse(fooQueue.isPending);
        letRun(function () {
          queue('foo', function () {
            letRun(function () {

              try {
                queue('foo', function () {
                  results.push(3);
                  queue('bar', function () {
                    throw 'ex bar';
                  });

                  results.push('not me');
                });
              } catch(ex) {
                results.push(ex.toString());
                q3.return();
              }

            });
            results.push(queue('bar', function () {
              return 'bar';
            }));
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

      queue('foo', function () {
        v.fooNew = true;
      });

      assert.isTrue(v.fooNew);

      function letRun(func) {
        koru.Fiber(func).run();
        var f = new Future();
        setTimeout(function () {
          f.return(v.q1);
        }, 1);
        f.wait();
      }
    },
  });
});
