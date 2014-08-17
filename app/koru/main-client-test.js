define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var koru = require('./main');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
    },

    "afTimeout": {
      setUp: function () {
        test.stub(window, 'setTimeout').returns(7766);
        test.stub(window, 'clearTimeout');

        test.stub(window, 'requestAnimationFrame').returns(123);
        test.stub(window, 'cancelAnimationFrame');
      },

      "test running": function () {
        var stop = koru.afTimeout(v.stub = test.stub(), 1234);

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

      "test canceling before timeout": function () {
        var stop = koru.afTimeout(v.stub = test.stub(), 1234);

        stop();

        assert.calledWith(window.clearTimeout, 7766);
        refute.called(window.cancelAnimationFrame);

        stop();

        assert.calledOnce(window.clearTimeout);
        refute.called(window.cancelAnimationFrame);
      },

      "test canceling after timeout": function () {
        var stop = koru.afTimeout(v.stub = test.stub(), 1234);

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
