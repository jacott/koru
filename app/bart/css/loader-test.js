/*global define window isClient document assert refute*/
isClient && define(function (require, exports, module) {

  var test, v;
  var geddon = require('bart-test');
  var core = require('bart/core');
  var session = require('bart/session');

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
      core.unload('bart/css/loader');
    },

    "test loading css": function (done) {
      refute.dom('head>link[rel=stylesheet]');

      var provide = test.stub(session, "provide");

      require(['bart/css/loader'], done.wrap(function (loader) {
        assert.calledWith(provide, "S");

        v.links = [];

        var origCallback = loader.callback;
        test.onEnd(function () {
          loader.callback = origCallback;
        });
        loader.callback = onload;

        provide.yield("Lbart/css/loader-test bart/css/loader-test2");
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
          assert.dom('head>link[rel=stylesheet][href="/bart/css/loader-test.css"]', function () {
            assert.same(v.links[0], this);
          });
          assert.dom('head>link[rel=stylesheet][href="/bart/css/loader-test2.css"]');
        });

        assert.dom('body', function () {
          var cstyle = window.getComputedStyle(this);
          assert.colorEqual(cstyle.backgroundColor, [230, 150, 90, 0.49], 0.01);
          assert.cssUnitNear("px", cstyle.marginLeft, 314);
        });


        provide.yield("Ubart/css/loader-test");
        assert.dom('head', function () {
          refute.dom('link[href="/bart/css/loader-test.css"]');
          assert.dom('head>link[rel=stylesheet][href="/bart/css/loader-test2.css"]');
        });
        done();
      }
    },
  });
});
