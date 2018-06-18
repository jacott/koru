isClient && define((require, exports, module)=>{
  /**
   * css/loader allows dynamic replacement of css and less files when
   * their contents change.
   **/
  const koru        = require('koru/main');
  const SessionBase = require('koru/session/base').constructor;
  const TH          = require('koru/test-helper');
  const api         = require('koru/test/api');

  const {stub, spy, onEnd, intercept} = TH;

  const CssLoader   = require('./loader');
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.session = new SessionBase('loader');
    });

    afterEach(()=>{
      const {head} = document;
      const sheets = document.querySelectorAll('head>link[rel=stylesheet]');
      for(let i = 0; i < sheets.length; ++i) {
        head.removeChild(sheets[i]);
      }
      CssLoader.removeAllCss();
      v = {};
    });

    test("construction", ()=>{
      /**
       * Construct a css loader
       * @param session listen for load messages from this session
       **/


      stub(v.session, 'provide');
      const loader = api.new()(v.session);
      assert.calledWith(v.session.provide, 'S', TH.match.func);

      assert.same(loader.session, v.session);
    });

    test("load all", (done)=>{
      /**
       * Load all css and less files under `dir`
       **/
      api.protoMethod('loadAll');
      const loader = new CssLoader(v.session);
      intercept(v.session, 'send', (cmd, data)=>{TH.session.send(cmd, data)});
      // proxy S command on to test session
      TH.session.provide('S', (data)=>{
        try {
          assert.same(data.split(' ').sort().join(' '),
                      'Lkoru/css/less-compiler-test.less koru/css/loader-test.css koru/css/loader-test2.css');
          done();
        } catch(ex) {
          done(ex);
        }
      });
      onEnd(()=>{TH.session.unprovide('S')});
      loader.loadAll('koru/css');
    });

    test("loading css", (done)=>{
      const onload = event =>{
        v.links.push(event.target);
        if (v.links.length === 2)
          try {
            twoLoaded();
          } catch (ex) {
            done(ex);
          }
      };

      const twoLoaded = ()=>{
        v.links.sort((a, b) => a.href === b.href ? 0 : a.href < b.href ? -1 : 1);
        assert.dom('head', ()=>{
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
        assert.dom('head', ()=>{
          refute.dom('link[href="/koru/css/loader-test.css"]');
          assert.dom('head>link[rel=stylesheet][href="/koru/css/.build/less-compiler-test.less.css"]');
        });
        done();
      };

      refute.dom('head>link[rel=stylesheet]');

      var provide = stub(v.session, "provide");
      var loader = new CssLoader(v.session);

      assert.calledWith(provide, "S");

      v.links = [];

      var origCallback = loader.callback;
      onEnd(()=>{loader.callback = origCallback});
      loader.callback = onload;

      provide.yield("Lkoru/css/loader-test.css koru/css/less-compiler-test.less");
    });
  });
});
