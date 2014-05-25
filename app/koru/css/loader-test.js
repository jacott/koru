isClient && define(function (require, exports, module) {

  var test, v;
  var geddon = require('../test');
  var env = require('../env');
  var session = require('../session/main');

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      var head = document.head;
      var sheets = document.querySelectorAll('head>link[rel=stylesheet]');
      for(var i = 0; i < sheets.length; ++i) {
        head.removeChild(sheets[i]);
      }
      env.unload('koru/css/loader');
    },

    "test loading css": function (done) {
      refute.dom('head>link[rel=stylesheet]');

      var provide = test.stub(session, "provide");

      require(['koru/css/loader'], done.wrap(function (loader) {
        assert.calledWith(provide, "S");

        v.links = [];

        var origCallback = loader.callback;
        test.onEnd(function () {
          loader.callback = origCallback;
        });
        loader.callback = onload;

        provide.yield("Lkoru/css/loader-test koru/css/loader-test2");
      }));

      function onload(event) {
        v.links.push(event.target);
        if (v.links.length === 2)
          done.wrap(twoLoaded)();
      }

      function twoLoaded() {
        v.links.sort(function (a, b) {
          return a.href === b.href ? 0 : a.href < b.href ? -1 : 1;
        });
        assert.dom('head', function () {
          assert.dom('head>link[rel=stylesheet][href="/koru/css/loader-test.css"]', function () {
            assert.same(v.links[0], this);
          });
          assert.dom('head>link[rel=stylesheet][href="/koru/css/loader-test2.css"]');
        });

        assert.dom('body', function () {
          var cstyle = window.getComputedStyle(this);
          assert.colorEqual(cstyle.backgroundColor, [230, 150, 90, 0.49], 0.01);
          assert.cssUnitNear("px", cstyle.marginLeft, 314);
        });


        provide.yield("Ukoru/css/loader-test");
        assert.dom('head', function () {
          refute.dom('link[href="/koru/css/loader-test.css"]');
          assert.dom('head>link[rel=stylesheet][href="/koru/css/loader-test2.css"]');
        });
        done();
      }
    },
  });
});
