isServer && define(function (require, exports, module) {
  /**
   * Server side page rendering coordinator.
   **/
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const DomTemplate     = require('koru/dom/template');
  const fst             = require('koru/fs-tools');
  const TH              = require('koru/test');
  const api             = require('koru/test/api');

  const path            = requirejs.nodeRequire('path');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./main');
  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.req = {
        headers: {},
        on: stub(),
      };
      v.res = {
        getHeader: stub(),
        setHeader: stub(),
        on: stub(),
        once: stub(),
        emit: stub(),
        write: stub(),
        writeHead: stub(),
        end: stub(),
      };
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test new"() {
      /**
       * Construct a page server registered with a webServer.
       *
       * @param WebServer the web-server to handler pages for.

       * @param pageDir the directory to find views and controllers under relative to the app
       * directory.

       * @param pathRoot handle pages starting with this path root.
       **/
      const newServerPages = api.new();
      const WebServer = {
        registerHandler: stub(),
      };

      const sp = newServerPages(WebServer);
      assert.isFunction(sp._handleRequest);

      assert.calledWith(WebServer.registerHandler, module.get('./main'), 'DEFAULT', sp._handleRequest);

      assert.same(sp._pageDirPath, path.resolve(module.toUrl('.'), '../../server-pages'));
    },

    "with instance": {
      setUp() {
        v.webServer = {registerHandler() {}};
        v.sp = new sut(v.webServer, 'koru/server-pages/test-pages');
        v.tpl = DomTemplate.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div", attrs:[
              ["=","id",["","id"]],
              ["=","class",["","classes"]],
            ],
            children:[],
          }],
        });
      },

      tearDown() {
        delete Dom.Foo;
        delete Dom.TestPage1;
      },

      "test less helper"() {
        spy(Compilers, 'read');
        assert.match(Dom._helpers.less.call({controller: {App: v.sp}}, "layouts/default"),
                     /background-color:\s*#112233;[\s\S]*sourceMappingURL/);

        assert.calledWith(Compilers.read, 'less', TH.match(/layouts\/default\.less/),
                          TH.match(/layouts\/\.build\/default\.less\.css/));
      },

      "test css helper"() {
        stub(fst, 'readFile').returns({toString() {return "css-output"}});
        assert.equals(Dom._helpers.css.call({controller: {App: v.sp}}, "my-css-page"),
                      'css-output');

        assert.calledWith(fst.readFile, v.sp._pageDirPath+'/my-css-page.css');
      },

      "test stop"() {
        const {sp} = v;
        v.webServer.deregisterHandler = stub();
        sp.stop();
        assert.calledWith(v.webServer.deregisterHandler, 'DEFAULT');
      },

      "test auto load html"() {
        removeTestBuild();

        const {sp} = v;

        sp._handleRequest(v.req, v.res, '/test-page1.html');

        assert.calledWith(v.res.write, '<!DOCTYPE html>\n');
        assert.calledWith(v.res.end, '<html><body id="defLayout"> '+
                          '<div> Test page 1  </div> </body></html>');

        v.res.end.reset();
        sp._handleRequest(v.req, v.res, '/test-page1/message-1');

        assert.calledWith(v.res.end, '<html><body id="defLayout"> '+
                          '<div> Test page 1 message-1 </div> </body></html>');
      },

      "test auto load markdown"() {
        removeTestBuild();
        const {sp} = v;

        sp._handleRequest(v.req, v.res, '/test-page-md.html');

        assert.calledWith(v.res.write, '<!DOCTYPE html>\n');
        assert.calledWith(v.res.end, '<html><body id="defLayout"> '+
                          '<h2 id="test-foo-">test Markdown</h2> </body></html>');
      },

      "test $parser"() {
        const {sp, tpl} = v;
        stub(tpl, '$render').returns(Dom.h({}));

        sp.addViewController('foo', tpl, class extends sp.BaseController {
          $parser() {this.params.pp = this.pathParts.join(':'); return 'index'}
        });

        sp._handleRequest(v.req, v.res, '/foo/1/2%201/3?a=x');

        assert.calledWith(tpl.$render, TH.match(ctl => {
          assert.equals(ctl.params, {a: 'x', pp: '1:2 1:3'});
          return true;
        }));
      },

      "test trailing slash"() {
        const {sp, tpl} = v;

        stub(tpl, '$render').returns(Dom.h({}));
        sp.addViewController('foo', tpl, class extends sp.BaseController {});

        sp._handleRequest(v.req, v.res, '/?abc=123');
        refute.called(v.res.end);

        sp._handleRequest(v.req, v.res, '/foo/?abc=123');

        assert.calledWith(tpl.$render, TH.match(ctl => {
          assert.equals(ctl.params, {abc: '123', id: ''});
          return true;
        }));

        assert.called(v.res.end);

        assert.equals(Dom.htmlToJson(Dom.textToHtml(
          v.res.end.firstCall.args[0])).html.id, 'defLayout');
      },

      "test CRUD"() {
        const {sp, tpl} = v;
        sp.defaultLayout = {$render(data) {return Dom.h({body: data.content})}};
        stub(tpl, '$render').returns(Dom.h({}));

        sp.addViewController('foo', tpl, class extends sp.BaseController {
          show() {
            assert.equals(this.params, {id: '1234'});
            this.render(Dom.h({id: 'show'}));
            v.showCalled = true;
          }
        });

        sp._handleRequest(v.req, v.res, '/foo/1234');

        assert(v.showCalled);
        assert.calledWith(v.res.end, '<body><div id="show"></div></body>');
      },
    },
  });

  const removeTestBuild = ()=>{
    fst.rm_r(path.join(v.sp._pageDirPath, '.build'));
  };

});
