isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Server side page rendering coordinator.
   *
   * ServerPages enables apps to serve dynamically created server-side web pages. By convention
   * ServerPages follow the
   * [CRUD, Verbs, and Actions](http://guides.rubyonrails.org/routing.html#crud-verbs-and-actions)
   * rules defined in Rails namely:
   *
   * |HTTP Verb|Path           |Controller#Action|Used for                                   |
   * |:--------|:---           |:----------------|:-------                                   |
   * |GET      |/books         |Books#index      |display a list of all books                |
   * |GET      |/books/new     |Books#new        |return an HTML form for creating a new book|
   * |POST     |/books         |Books#create     |create a new book                          |
   * |GET      |/books/:id     |Books#show       |display a specific book                    |
   * |GET      |/books/:id/edit|Books#edit       |return an HTML form for editing a book     |
   * |PATCH/PUT|/books/:id     |Books#update     |update a specific book                     |
   * |DELETE   |/books/:id     |Books#destroy    |delete a specific book                     |
   *
   * To implement index, new, show and edit actions all that is needed is a corresponding
   * {#koru/dom/template} like `Book.Show`. The create, update and destroy actions need the action
   * method implemented in the [controller](#koru/server-pages/base-controller) like
   * `BooksController`.
   *
   * For the show, edit, update and destroy actions the id can be accessed from `{{params.id}}` in
   * the template or `this.params.id` in the controller.
   *
   * Alternatively Controller actions matching the HTTP verb can be used and these take precedence
   * over other actions; so if the controller has index, show, new, edit *and get* action methods
   * then the get method will override the other four action methods. See
   * {#koru/server-pages/base-controller} for more ways to override the default actions.
   *
   * # Creating a server page
   *
   * The simplest way to create a new server-page is to run `./scripts/koru generate server-page
   * book` (or select from emacs koru menu). This will create the following files under
   * `app/server-pages`:
   *
   * * `book.html` - The view as an html template file. book.md may be used instead for a markdown
   * templet file.

   * * `book.js`   - The [controller](#koru/server-pages/base-controller) corresponding to the
   * `book.html` view used for updates and to control rendering the view.

   * * `book.less` - A [lessjs](http://lesscss.org/) (or css) file that is included in the rendered
   * page (if using default layout).
   *
   * If a default layout does not exist then one will be created in `app/server-pages/layouts` with
   * the files: `default.html`, `default.js` and `default.less`
   *
   * # Configuration
   *
   * No configuration is needed for server-pages; they are automatically added when the first call
   * to `koru generate server-page` is made. This will register a page server for the
   * {#koru/web-server} in the `app/startup-server.js` file.
   *
   * Any pages under `app/server-pages` will be automatically loaded when am HTTP request is made
   * that corresponds to the page.
   **/
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const Ctx             = require('koru/dom/ctx');
  const Template        = require('koru/dom/template');
  const fst             = require('koru/fs-tools');
  const BaseController  = require('koru/server-pages/base-controller');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const WebServer       = require('koru/web-server');

  const {private$} = require('koru/symbols');

  const path = requirejs.nodeRequire('path');

  const {stub, spy, util, intercept, match: m} = TH;

  const ServerPages = require('./main');

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    let v = {};
    beforeEach(() => {
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
        initInstExample: 'const serverPages = await ServerPages.build(WebServer);'});
    });

    afterEach(() => {
      v = {};
    });

    test('build', async () => {
      /**
       * Register a page server with a webServer.
       *
       * @param WebServer the web-server to handler pages for.

       * @param pageDir the directory to find views and controllers under relative to the app
       * directory.

       * @param pathRoot handle pages starting with this path root.
       **/
      api.method();
      //[
      const WebServer = require('koru/web-server');
      //]
      stub(WebServer, 'registerHandler');
      //[
      const sp = await ServerPages.build(WebServer);
      //]
      assert.isFunction(sp._handleRequest);

      assert.calledWith(WebServer.registerHandler, module.get('./main'), 'DEFAULT', sp._handleRequest);

      assert.same(sp._pageDirPath, path.resolve(module.toUrl('.'), '../../server-pages'));
    });

    group('with instance', () => {
      beforeEach(async () => {
        v.webServer = {registerHandler() {}};
        v.sp = await ServerPages.build(v.webServer, 'koru/server-pages/test-pages');
        v.tpl = Template.newTemplate({
          name: 'Foo',
          nodes: [{
            name: 'div', attrs: [
              ['=', 'id', ['', 'id']],
              ['=', 'class', ['', 'classes']],
            ],
            children: [],
          }],
        });
      });

      afterEach(() => {
        delete Dom.tpl.Foo;
        delete Dom.tpl.TestPage1;
      });

      test('stop', () => {
        /**
         * Deregister this page server from {#koru/web-server}
         **/
        api.protoMethod('stop');
        const {sp} = v;
        v.webServer.deregisterHandler = stub();
        sp.stop();
        assert.calledWith(v.webServer.deregisterHandler, 'DEFAULT');
      });

      test('auto load html', async () => {
        await removeTestBuild();

        const {sp} = v;

        await sp._handleRequest(v.req, v.res, '/test-page1.html');

        assert.calledWith(v.res.write, Buffer.from('<!DOCTYPE html>\n'));
        assert.calledWith(v.res.end, Buffer.from('<html><body id="defLayout"> ' +
          '<div> Test page 1  </div> </body></html>'));

        v.res.end.reset();
        await sp._handleRequest(v.req, v.res, '/test-page1/message-1');

        assert.calledWith(v.res.end, Buffer.from('<html><body id="defLayout"> ' +
          '<div> Test page 1 message-1 </div> </body></html>'));
      });

      test('auto load markdown', async () => {
        await removeTestBuild();
        const {sp} = v;

        await sp._handleRequest(v.req, v.res, '/test-page-md.html');

        assert.calledWith(v.res.write, Buffer.from('<!DOCTYPE html>\n'));
        assert.calledWith(v.res.end, m((a) => (assert.equals(a.toString(), '<html><body id="defLayout"> ' +
          '<h2 id="test-foo">test Markdown</h2> </body></html>'), true)));
      });

      test('$parser', async () => {
        const {sp, tpl} = v;
        stub(tpl, '$render').returns(Dom.h({}));

        sp.addViewController('foo', tpl, class extends sp.BaseController {
          $parser() {this.params.pp = this.pathParts.join(':'); return 'index'}
        });

        await sp._handleRequest(v.req, v.res, '/foo/1/2%201/3?a=x');

        assert.calledWith(tpl.$render, TH.match((ctl) => {
          assert.equals(ctl.params, {a: 'x', pp: '1:2 1:3'});
          return true;
        }));
      });

      test('funny pathParts', async () => {
        const {sp, tpl} = v;

        sp.addViewController('foo', tpl, class extends sp.BaseController {
          constructor(opts) {
            super(opts);
            v.ctl = this;
          }
        });

        await sp._handleRequest(v.req, v.res, '/foo/1/<%= 2%201 %>/3?a=x');

        assert.equals(v.ctl.pathParts, ['1', '<%= 2 1 %>', '3']);
      });

      test('trailing slash', async () => {
        const {sp, tpl} = v;

        stub(tpl, '$render').returns(Dom.h({}));
        sp.addViewController('foo', tpl, class extends sp.BaseController {});

        await sp._handleRequest(v.req, v.res, '/?abc=123');
        refute.called(v.res.end);

        await sp._handleRequest(v.req, v.res, '/foo/?abc=123');

        assert.calledWith(tpl.$render, TH.match((ctl) => {
          assert.equals(ctl.params, {abc: '123'});
          return true;
        }));

        assert.called(v.res.end);

        const text = v.res.end.firstCall.args[0].toString();

        assert.equals(Dom.htmlToJson(Dom.textToHtml(text)).html.id, 'defLayout');
      });

      test('exception', async () => {
        const {sp, tpl} = v;

        class MyController extends sp.BaseController {
          $parser() {return 'foo'}
          foo() {throw new koru.Error(400, {name: [['invalid']]})}
        }

        sp.addViewController('foo', tpl, MyController);

        await assert.exception(
          () => sp._handleRequest(v.req, v.res, '/foo/1234'),
          {error: 400, reason: {name: [['invalid']]}});
      });
    });

    const removeTestBuild = async () => {
      await fst.rm_rf(path.join(v.sp._pageDirPath, '.build'));
    };
  });
});
