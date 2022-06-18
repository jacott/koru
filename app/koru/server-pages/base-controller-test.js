isServer && define((require, exports, module) => {
  'use strict';
  /**
   * BaseController provides the default actions for page requests. Action controllers extend
   * BaseController to intercept actions. See {#koru/server-pages/main}
   *
   * Controllers are not constructed directly; rather {#koru/server-pages/main} will invoke the
   * constructor when the user requests a page associated with the controller.
   *
   **/
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const HTMLDocument    = require('koru/dom/html-doc');
  const Template        = require('koru/dom/template');
  const Future          = require('koru/future');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, stubProperty, intercept} = TH;

  const BaseController = require('./base-controller');

  class Book {}

  const genericApp = () => {
    return {defaultLayout: {$render({content}) {
      return Dom.h({body: content});
    }}};
  };

  const {createTextNode} = HTMLDocument.prototype;

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    let v = {};
    beforeEach(() => {
      v.opts = {
        request: new HttpHelper.RequestStub({method: 'GET'}),
        response: {
          writeHead: stub(),
          write: stub(),
          end: stub(),
        },
        params: {},
        pathParts: [],
      };
      stubProperty(BaseController, 'App', {get: genericApp});
    });

    afterEach(() => {
      v = {};
    });

    test('defaultETag', () => {
      assert.match(BaseController.defaultETag, /^h[0-9]+$/);
    });

    test('json getBody', async () => {
      /**
       * The body of the request. If the content type is: `application/json` or
       * `application/x-www-form-urlencoded` then the body is converted to an object map otherwise
       * the raw string is returned.
       **/
      api.protoProperty('body');
      const {request} = v.opts;
      request._setBody({sample: 'json'});

      request.headers['content-type'] = 'application/json';

      class MyController extends BaseController {
        $parser() {}
      }
      const ctl = await MyController.build(v.opts);

      const ans = await ctl.getBody();

      assert.equals(ans, {sample: 'json'});
      assert.same(ans, await ctl.getBody());
    });

    test('form body', async () => {
      api.protoProperty('body');
      const {request} = v.opts;
      request._setBody('a%20%2Bb=q%5Ba%5D&foo=bar');

      request.headers['content-type'] = 'application/x-www-form-urlencoded';

      class MyController extends BaseController {
        $parser() {}
      }
      const ctl = await MyController.build(v.opts);

      const ans = await ctl.getBody();

      assert.equals(ans, {'a +b': 'q[a]', foo: 'bar'});
      assert.same(ans, await ctl.getBody());
    });

    test('other body', async () => {
      api.protoProperty('body');
      const {request} = v.opts;
      request._setBody(v.exp = 'a%20%2Bb=q%5Ba%5D&foo=bar');

      request.headers['content-type'] = 'application/data';

      class MyController extends BaseController {
        $parser() {}
      }
      const ctl = await MyController.build(v.opts);

      const ans = await ctl.getBody();

      assert.equals(ans, v.exp);
      assert.same(ans, await ctl.getBody());
    });

    test('redirect', async () => {
      /**
       * Send a redirect response to the client.

       * @param url the location to redirect to.
       *
       * @param {number} code the statusCode to send.
       **/
      api.protoMethod('redirect');
      const {opts} = v;

      class MyController extends BaseController {
        $parser() {
          return 'foo';
        }

        foo() {
          this.redirect('/foo/1234');
        }
      }

      const ctl = await MyController.build(opts);

      assert.calledWith(opts.response.writeHead, 302, {Location: '/foo/1234'});
      assert.calledWithExactly(opts.response.end);
    });

    test('error', async () => {
      /**
       * Send an error response to the client;
       *
       * @param code the statusCode to send.
       *
       * @param [message] the response body to send.
       **/
      api.protoMethod('error');
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {
          this.error(418, 'Short and stout');
          return 'new';
        }
      }
      const ctl = await MyController.build(v.opts);

      refute.called(response.writeHead);
      assert.calledOnceWith(response.end, 'Short and stout');
      assert.equals(response.statusCode, 418);
    });

    test('not modified', async () => {
      const {opts} = v;
      opts.view = {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }};
      opts.pathParts = [];
      opts.request.headers['if-none-match'] = '  W/"' + BaseController.defaultETag + '"\n\n';

      class MyController extends BaseController {
      }
      await MyController.build(opts);

      assert.same(opts.response.statusCode, 304);
    });

    test('modified', async () => {
      const {opts} = v;
      opts.view = {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }};
      opts.pathParts = [];
      opts.request.headers['if-none-match'] = '  W/"x' + BaseController.defaultETag + '"\n\n';

      class MyController extends BaseController {
      }
      await MyController.build(opts);

      assert.same(opts.response.statusCode, void 0);
    });

    test('No Content', async () => {
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {return null}
      }

      await MyController.build(v.opts);

      assert.same(response.statusCode, 204);
      assert.calledWithExactly(response.end);
    });

    test('html response', async () => {
      const {response} = v.opts;

      const raw1 = createTextNode();

      const f1 = new Future();
      const f2 = new Future();

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {
          this.addPromise(f1.promiseAndReset());
          f2.resolve();
          return Dom.h({html: {body: ['foo', raw1]}})}
      }

      const p = MyController.build(v.opts);

      await f2.promiseAndReset();
      raw1.data = 'bar🥝';
      f1.resolve();

      await p;

      assert.calledWith(response.writeHead, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': 52,
        ETag: TH.match(/W\/"h[0-9]+"/),
      });

      assert.calledWithExactly(response.end, Buffer.from('<html><body>foobar🥝</body></html>'));
    });

    test('json response', async () => {
      const {response} = v.opts;

      let delayed = 'old';
      const future = new Future();
      const f2 = new Future();
      let ctl;

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {
          ctl = this;
          this.addPromise(future.promiseAndReset());
          f2.resolve();
          return {html: {body: {toJSON: () => delayed}}}}
      }

      const p = MyController.build(v.opts);

      await f2.promiseAndReset();
      ctl.addPromise(Promise.resolve().then(() => {f2.resolve(); ctl.addPromise(future.promiseAndReset())}));
      future.resolve();
      await f2.promiseAndReset();
      delayed = 'foo';
      future.resolve();

      assert.same(await p, ctl);

      assert.calledWithExactly(response.end, Buffer.from('{"html":{"body":"foo"}}'));
      assert.calledWith(response.writeHead, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': 23,
      });
      refute.called(response.write);
    });

    test('unknown method', async () => {
      const {opts} = v;
      opts.request.method = 'FOO';

      const foo = stub();

      class MyController extends BaseController {
        foo() {foo(this)}
      }

      await MyController.build(opts);

      refute.called(foo);
      assert.equals(opts.response.statusCode, 404);
      assert.calledWith(opts.response.end, undefined);
    });

    test('custom method', async () => {
      const {opts} = v;
      opts.request.method = 'FOO';

      const foo = stub().invokes((call) => {call.args[0].rendered = true});

      class MyController extends BaseController {
        $parser() {
          if (this.method === 'FOO') return 'foo';
          super.$parser();
        }

        foo() {foo(this)}
      }

      const controller = await MyController.build(opts);

      assert.calledWith(foo, controller);
    });

    group('CRUD templates', () => {
      beforeEach(() => {
        const {opts} = v;
        const tpl = opts.view = {$render: (ctl) => Dom.h({class: 'index', div: [ctl.method]})};
        tpl.Show = {$render: (ctl) => Dom.h({class: 'show', div: [ctl.params.id]})};
        tpl.New = {$render: (ctl) => Dom.h({class: 'new', div: ctl.pathParts})};
        tpl.Edit = {$render: (ctl) => Dom.h({class: 'edit', div: [ctl.params.id]})};
        tpl.Create = {$render: (ctl) => Dom.h({class: 'create', div: [ctl.method]})};
        tpl.Update = {$render: (ctl) => Dom.h({class: 'update', div: [ctl.params.id]})};
        tpl.Destroy = {$render: (ctl) => Dom.h({class: 'destroy', div: [ctl.params.id]})};
        v.run = async (method, url, action, body) => {
          const Foo = class extends BaseController {
          };

          v.opts.pathParts = url.split('/').slice(2);
          opts.request.method = method;

          method === 'GET' && api.property(action === 'index'
                                           ? 'view'
                                           : 'view.' + util.capitalize(action),
                                           {value: Template});

          await Foo.build(opts);

          assert.calledWith(opts.response.end, Buffer.from(`<body><div class="${action}">${body}</div></body>`));
        };
      });

      test('view', async () => {
        /**
         * Templete for index action. All other action templates are children of this template.
         *
         * # Example request
         * ```
         * GET /foo
         * ```
         **/
        await v.run('GET', '/foo', 'index', 'GET');
      });

      test('new', async () => {
        /**
         * Templete for new action.
         *
         * # Example request
         * ```
         * GET /foo/new
         * ```
         **/
        await v.run('GET', '/foo/new', 'new', 'new');
      });

      test('create', async () => {
        await v.run('POST', '/foo/new', 'create', 'POST');
      });

      test('show', async () => {
        /**
         * Templete for show action.
         *
         * # Example request
         * ```
         * GET /foo/:id
         * ```
         **/
        await v.run('GET', '/foo/1234', 'show', '1234');
      });

      test('edit', async () => {
        /**
         * Templete for edit action.
         *
         * # Example request
         * ```
         * GET /foo/:id/edit
         * ```
         **/
        await v.run('GET', '/foo/1234/edit', 'edit', '1234');
      });

      test('update;patch', async () => {
        await v.run('PATCH', '/foo/1234', 'update', '1234');
      });

      test('update;put', async () => {
        await v.run('PUT', '/foo/1234', 'update', '1234');
      });

      test('destroy', async () => {
        await v.run('DELETE', '/foo/1234', 'destroy', '1234');
      });
    });

    group('CRUD actions', () => {
      beforeEach(() => {
        const {opts} = v;

        spy(BaseController.prototype, 'error');

        v.run = async (action, url, method='GET') => {
          const Foo = class extends BaseController {
            [action]() {this.error(418, 'teapot')}
          };

          api.customIntercept(Foo.prototype, {
            name: action, sig: `<class extends BaseController>#${action}()`});

          opts.pathParts = url.split('/').slice(2);
          opts.request.method = method;
          await Foo.build(opts);

          assert.calledWith(opts.response.end, 'teapot');
        };
      });

      test('index', async () => {
        /**
         * Implement this action to control index requests:
         *
         * `GET /books`
         **/
        //[
        class Books extends BaseController {
          index() {
            this.params.books = Book.query;
          }
        }
        //]
        await v.run('index', '/foo');
      });

      test('new', async () => {
        /**
         * Implement this action to control new requests:
         *
         * `GET /books/new`
         **/
        //[
        class Books extends BaseController {
          new() {
            this.params.book = Book.build();
          }
        }
        //]
        await v.run('new', '/foo/new');
      });

      test('create', async () => {
        /**
         * Implement this action to process create requests.
         *
         * `POST /books`
         **/
        //[
        class Books extends BaseController {
          async create() {
            const book = await Book.create(await this.getBody());
            this.redirect('/books/' + book._id);
          }
        }
        //]
        await v.run('create', '/foo', 'POST');
      });

      test('show', async () => {
        /**
         * Implement this action to control show requests:
         *
         * `GET /books/:id`
         **/
        //[
        class Books extends BaseController {
          show() {
            this.params.book = Book.findById(this.params.id);
          }
        }
        //]
        await v.run('show', '/foo/1234');
      });

      test('edit', async () => {
        /**
         * Implement this action to control show requests:
         *
         * `GET /books/:id/edit`
         **/
        //[
        class Books extends BaseController {
          edit() {
            this.params.book = Book.findById(this.params.id);
          }
        }
        //]
        await v.run('edit', '/foo/1234/edit');
      });

      test('update', async () => {
        /**
         * Implement this action to process update requests.
         *
         * `PUT /books/:id` or `PATCH /books/:id`
         **/
        //[
        class Books extends BaseController {
          update() {
            const book = Book.findById(this.params.id);
            book.changes = this.body;
            book.$$save();
            this.redirect('/books/' + book._id);
          }
        }
        //]
        await v.run('update', '/foo/1234', 'PUT');
      });

      test('delete', async () => {
        /**
         * Implement this action to process destroy requests.
         *
         * `DELETE /books/:id`
         **/
        //[
        class Books extends BaseController {
          destroy() {
            const book = Book.findById(this.params.id);
            book.$remove();
            this.redirect('/books');
          }
        }
        //]
        await v.run('destroy', '/foo/1234', 'DELETE');
      });
    });

    test('aroundFilter', async () => {
      /**
       * An aroundFiler runs "around" an action controller. It is called are the {##$parser} has
       * run. You can control which action is called by changing the the value of `this.action`.
       *
       * @param callback call this function to run the `this.action`
       *
       **/
      const {opts} = v;
      let testDone = false;
      //[
      class Foo extends BaseController {
        async aroundFilter(callback) {
          this.params.userId = 'uid123';
          if (this.action == 'edit' && this.pathParts[0] == '1234') {
            this.action = 'specialEdit';
          }
          await callback(this);
          testDone = this.rendered;
        }

        specialEdit() {
          this.renderHTML(Dom.h({div: this.params.userId}));
        }
      }
      //]

      api.customIntercept(Foo.prototype, {
        name: 'aroundFilter', sig: '<class extends BaseController>#'});

      opts.pathParts = ['1234', 'edit'];
      await Foo.build(opts);

      assert.calledWith(opts.response.end, Buffer.from('<div>uid123</div>'));
      assert.isTrue(testDone);
    });

    test('override $parser', async () => {
      /**
       * The default request parser. Override this method for full control of the request.
       **/
      api.protoMethod('$parser');
      const {opts} = v;
      opts.request.method = 'DELETE';

      const Auth = {canDelete() {return false}};

      //[
      class Books extends BaseController {
        $parser() {
          if (this.method === 'DELETE' && ! Auth.canDelete(this)) {
            this.error(403, 'You do not have delete access');
            return;
          }

          super.$parser();
        }
      }
      //]

      await Books.build(opts);

      assert.calledWith(opts.response.end, 'You do not have delete access');
    });

    test('render', async () => {
      /**
       * Respond to the client with the rendered content wrapped in the specified layoyut.
       *
       * @param content usually rendered html but can be whatever the layout requires.
       *
       * @param [layout] The layout View to wrap the content. defaults to
       * `ServerPages.defaultLayout` or a very basic html page.
       **/
      api.protoMethod('render');
      const {opts} = v;

      //[
      class HelloController extends BaseController {
        $parser() {
          this.render(Dom.h({div: 'Hello world'}), {layout: {$render({content}) {
            return Dom.h({html: [{head: {title: 'My First App'}}, {body: content}]});
          }}});
        }
      }
      //]

      await HelloController.build(opts);

      assert.calledWith(
        opts.response.end,
        Buffer.from('<html><head><title>My First App</title></head><body><div>Hello world</div></body></html>'));
    });

    test('renderHTML', async () => {
      /**
       * Respond to the client with the rendered HTML content.
       *
       * @param html the html element to render.
       **/
      api.protoMethod('renderHTML');
      const {opts} = v;

      //[
      class HelloController extends BaseController {
        async $parser() {
          await this.renderHTML(Dom.h({div: 'Hello world'}));
        }
      }
      //]

      await HelloController.build(opts);

      assert.calledWith(
        opts.response.end,
        Buffer.from('<div>Hello world</div>'));
    });

    test('$parser, render', async () => {
      const {opts} = v;
      opts.pathParts = ['foo', '123'];

      class MyController extends BaseController {
        $parser() {
          return 'foo';
        }

        foo() {
          this.render(Dom.h({div: ['foo€']}), {layout: {$render({content}) {
            return Dom.h({main: content});
          }}});
        }
      }

      const controller = await MyController.build(opts);

      assert.same(controller.request, opts.request);
      assert.same(controller.response, opts.response);
      assert.same(controller.pathParts, opts.pathParts);
      assert.same(controller.params, opts.params);

      assert.calledWith(opts.response.writeHead, 200, {
        'Content-Length': 46,
        'Content-Type': 'text/html; charset=utf-8',
        ETag: TH.match.string,
      });
      assert.calledWith(opts.response.write, '<!DOCTYPE html>\n');
      assert.calledWith(opts.response.end, Buffer.from('<main><div>foo€</div></main>'));
    });

    test('Index template', async () => {
      const {opts} = v;
      opts.view = {$render(ctl) {
        return Dom.h({div: 'index'});
      }};

      class Root extends BaseController {
      }

      await Root.build(opts);

      assert.calledWith(opts.response.end, Buffer.from('<body><div>index</div></body>'));
    });

    test('DOCTYPE supplied', async () => {
      const {opts} = v;
      opts.pathParts = [];

      class MyController extends BaseController {
        index() {
          this.render(Dom.h({body: ['x']}), {layout: {$render({content}) {
            return {outerHTML: '<!CUSTOM>' + content.outerHTML};
          }}});
        }
      }

      const controller = await MyController.build(opts);

      assert.same(controller.request, opts.request);
      assert.same(controller.response, opts.response);
      assert.same(controller.pathParts, opts.pathParts);
      assert.same(controller.params, opts.params);

      assert.calledWith(opts.response.writeHead, 200, {
        'Content-Length': 23,
        'Content-Type': 'text/html; charset=utf-8',
        ETag: TH.match.string,
      });
      refute.called(opts.response.write);
      assert.calledWith(opts.response.end, Buffer.from('<!CUSTOM><body>x</body>'));
    });
  });
});
