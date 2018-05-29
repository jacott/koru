isServer && define(function (require, exports, module) {
  /**
   * Server side page rendering coordinator.
   *
   * ServerPages enables apps to serve dynamically created server-side web pages. By convention
   * ServerPages follow the
   * [CRUD, Verbs, and Actions](http://guides.rubyonrails.org/routing.html#crud-verbs-and-actions)
   * rules defined in Rails namely:
   *
   * |HTTP Verb |Path             |Controller#Action|Used for                                     |
   * |----------|----             |-----------------|--------                                     |
   * |GET       |/books           |Books#index      |display a list of all books                  |
   * |GET       |/books/new       |Books#new        |return an HTML form for creating a new book  |
   * |POST      |/books           |Books#create     |create a new book                            |
   * |GET       |/books/:id       |Books#show       |display a specific book                      |
   * |GET       |/books/:id/edit  |Books#edit       |return an HTML form for editing a book       |
   * |PATCH/PUT |/books/:id       |Books#update     |update a specific book                       |
   * |DELETE    |/books/:id       |Books#destroy    |delete a specific book                       |
   *
   * The simplest way to create a new server-page is to run `./scripts/koru g server-page book` (or
   * select from emacs koru menu). This will create the following files under `app/server-pages`:
   *
   * * `book.html` - The view as an html template file. book.md may be used instead for a markdown
   * templet file.

   * * `book.js` - The [controller](#koru/server-pages/base-controller) corresponding to the
   * `book.html` view used for updates and to control rendering the view.

   * * `book.less` - A lessjs (or css) file that is included in the rendered page (if using default
   * layout).
   *
   * If a default layout does not exist then one will be created in `app/server-pages/layouts` with the files: `default.html`, `default.js` and `default.less`
   *
   **/
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const DomTemplate     = require('koru/dom/template');
  const fst             = require('koru/fs-tools');
  const TH              = require('koru/test');
  const api             = require('koru/test/api');
  const WebServer       = require('koru/web-server');

  const path            = requirejs.nodeRequire('path');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./main');
  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.req = {
        method: 'GET',
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
      api.module({
        initInstExample: 'const serverPages = new ServerPages(WebServer);'});
    },

    tearDown() {
      v = null;
    },

    "test new"() {
      /**
       * Register a page server with a webServer.
       *
       * @param WebServer the web-server to handler pages for.

       * @param pageDir the directory to find views and controllers under relative to the app
       * directory.

       * @param pathRoot handle pages starting with this path root.
       **/
      const new_ServerPages = api.new();

      //[
      const WebServer = require('koru/web-server');
      //]
      stub(WebServer, 'registerHandler');
      //[
      const sp = new_ServerPages(WebServer);
      //]
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

      "test page helper"() {
        assert.equals(Dom._helpers.page.call({controller: {pathParts: []}}), 'index');
        assert.equals(Dom._helpers.page.call({controller: {pathParts: ['show']}}), 'show');
      },

      "test controllerId helper"() {
        assert.equals(Dom._helpers.controllerId.call({
          controller: {constructor: {modId: 'foo'}}}), 'foo');
      },

      "test stop"() {
        /**
         * Deregister this page server from {#koru/web-server}
         **/
        api.protoMethod('stop');
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

      "test exception"() {
        const {sp, tpl} = v;


        class MyController extends sp.BaseController {
          $parser() {return 'foo'}
          foo() {throw new koru.Error(400, {name: [['invalid']]})}
        }

        sp.addViewController('foo', tpl, MyController);

        const error = stub();

        sp._handleRequest(v.req, v.res, '/foo/1234', error);

        assert.calledWith(error, 400, {name: [['invalid']]});
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
