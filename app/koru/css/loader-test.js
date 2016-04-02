isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var koru = require('../main');
  var session = require('../session/base');

  TH.testCase(module, {
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
      koru.unload('koru/css/loader');
    },

    "test load all": function (done) {
      require(['koru/css/loader'], done.wrap(function (loader) {
        // proxy S command on to test session
        TH.session.provide('S', done.wrap(function (data) {
          assert.same(data.split(' ').sort().join(' '),
                      'Lkoru/css/less-compiler-test.less koru/css/loader-test.css koru/css/loader-test2.css');
          done();
        }));
        test.intercept(session, 'send', function (cmd, data) {
          TH.session.send(cmd, data);
        });
        test.onEnd(function () {TH.session.unprovide('S')});
        loader.loadAll('koru/css');
      }));
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

        provide.yield("Lkoru/css/loader-test.css koru/css/less-compiler-test.less");
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
            assert.same(v.links[1], this);
          });
          assert.dom('head>link[rel=stylesheet][href="/koru/css/.build/less-compiler-test.less.css"]');
        });

        assert.dom('body', function () {
          var cstyle = window.getComputedStyle(this);
          assert.colorEqual(cstyle.backgroundColor, [230, 150, 90, 0.49], 0.02);
          assert.colorEqual(cstyle.color, [204, 0, 0, 1]);
        });


        provide.yield("Ukoru/css/loader-test.css");
        assert.dom('head', function () {
          refute.dom('link[href="/koru/css/loader-test.css"]');
          assert.dom('head>link[rel=stylesheet][href="/koru/css/.build/less-compiler-test.less.css"]');
        });
        done();
      }
    },
  });
});
