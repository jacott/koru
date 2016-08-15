isClient && define(function (require, exports, module) {
  /**
   * css/loader allows dynamic replacement of css and less files when
   * their contents change.
   **/
  var test, v;
  const api           = require('koru/test/api');
  const koru          = require('../main');
  const SessionBase   = require('../session/base').constructor;
  const TH            = require('../test');
  const CssLoader     = require('./loader');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.session = new SessionBase('loader');
      api.module();
    },

    tearDown() {
      v = null;
      var head = document.head;
      var sheets = document.querySelectorAll('head>link[rel=stylesheet]');
      for(var i = 0; i < sheets.length; ++i) {
        head.removeChild(sheets[i]);
      }
      CssLoader.removeAllCss();
    },

    "test construction"() {
      /**
       * Construct a css loader
       * @param session listen for load messages from this session
       **/


      test.stub(v.session, 'provide');
      const loader = api.new()(v.session);
      assert.calledWith(v.session.provide, 'S', TH.match.func);

      assert.same(loader.session, v.session);
    },

    "test load all"(done) {
      /**
       * Load all css and less files under <dir>
       **/
      api.protoMethod('loadAll');
      const loader = new CssLoader(v.session);
      test.intercept(v.session, 'send', function (cmd, data) {
        TH.session.send(cmd, data);
      });
      // proxy S command on to test session
      TH.session.provide('S', done.wrap(function (data) {
        assert.same(data.split(' ').sort().join(' '),
                    'Lkoru/css/less-compiler-test.less koru/css/loader-test.css koru/css/loader-test2.css');
        done();
      }));
      test.onEnd(function () {TH.session.unprovide('S')});
      loader.loadAll('koru/css');
    },

    "test loading css"(done) {
      refute.dom('head>link[rel=stylesheet]');

      var provide = test.stub(v.session, "provide");
      var loader = new CssLoader(v.session);

      assert.calledWith(provide, "S");

      v.links = [];

      var origCallback = loader.callback;
      test.onEnd(function () {
        loader.callback = origCallback;
      });
      loader.callback = onload;

      provide.yield("Lkoru/css/loader-test.css koru/css/less-compiler-test.less");

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
