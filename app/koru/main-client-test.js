define(function (require, exports, module) {
  const TH   = require('./test-helper');

  const koru = require('./main');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test getHashOrigin"() {
      test.stub(koru, 'getLocation').returns({protocol: 'p', host: 'h', pathname: 'n'});

      assert.same(koru.getHashOrigin(), 'p//hn');
    },

    "test koru.global"() {
      assert.same(koru.global, window);
    },

    "afTimeout": {
      setUp() {
        assert.same(TH.geddon._origAfTimeout, koru._afTimeout);
        test.stub(window, 'setTimeout').returns(7766);
        test.stub(window, 'clearTimeout');

        test.stub(window, 'requestAnimationFrame').returns(123);
        test.stub(window, 'cancelAnimationFrame');
      },

      "test zero timeout"() {
        koru._afTimeout(v.stub = test.stub());

        refute.called(setTimeout);
        assert.calledWith(window.requestAnimationFrame, TH.match.func);

        window.requestAnimationFrame.yield();
        assert.called(v.stub);
      },

      "test -ve timeout"() {
        koru._afTimeout(v.stub = test.stub(), -3);

        refute.called(setTimeout);
        assert.calledWith(window.requestAnimationFrame);
      },

      "test running"() {
        const stop = koru._afTimeout(v.stub = test.stub(), 1234);

        assert.calledWith(setTimeout, TH.match.func, 1234);

        refute.called(v.stub);
        setTimeout.yield();

        assert.calledWith(window.requestAnimationFrame, TH.match.func);

        refute.called(v.stub);
        window.requestAnimationFrame.yield();

        assert.called(v.stub);

        stop();

        refute.called(window.clearTimeout);
        refute.called(window.cancelAnimationFrame);
      },

      "test canceling before timeout"() {
        const stop = koru._afTimeout(v.stub = test.stub(), 1234);

        stop();

        assert.calledWith(window.clearTimeout, 7766);
        refute.called(window.cancelAnimationFrame);

        stop();

        assert.calledOnce(window.clearTimeout);
        refute.called(window.cancelAnimationFrame);
      },

      "test canceling after timeout"() {
        const stop = koru._afTimeout(v.stub = test.stub(), 1234);

        setTimeout.yield();

        stop();

        refute.called(window.clearTimeout);
        assert.called(window.cancelAnimationFrame, 123);

        stop();

        refute.called(window.clearTimeout);
        assert.calledOnce(window.cancelAnimationFrame);
      },
    },
  });
});
