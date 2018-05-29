define(function (require, exports, module) {
  /**
   * BaseController provides the default actions for page requests. Action controllers extend
   * BaseController to intercept actions. See {#koru/server-pages/main}
   *
   * Controllers are not constructed directly; rather {#koru/server-pages/main} will invoke the
   * constructor when the user requests a page associated with the controller.
   *
   **/
  const Dom             = require('koru/dom');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test');
  const api             = require('koru/test/api');
  const util            = require('koru/util');

  const {stub, spy, onEnd, stubProperty} = TH;

  const BaseController  = require('./base-controller');
  let v = null;

  const genericApp = ()=>{
    return {defaultLayout: {$render({content}) {
      return Dom.h({main: content});
    }}};
  };


  TH.testCase(module, {
    setUp() {
      v = {};
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
    },

    tearDown() {
      v = null;
    },

    "test defaultETag"() {
      assert.match(BaseController.defaultETag, /^h[0-9]+$/);
    },

    "test json body"() {
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
      const ctl = new MyController(v.opts);

      const ans = ctl.body;

      assert.equals(ans, {sample: 'json'});
      assert.same(ans, ctl.body);
    },

    "test form body"() {
      api.protoProperty('body');
      const {request} = v.opts;
      request._setBody("a%20%2Bb=q%5Ba%5D&foo=bar");

      request.headers['content-type'] = 'application/x-www-form-urlencoded';

      class MyController extends BaseController {
        $parser() {}
      }
      const ctl = new MyController(v.opts);

      const ans = ctl.body;

      assert.equals(ans, {'a +b': 'q[a]', foo: 'bar'});
      assert.same(ans, ctl.body);
    },

    "test other body"() {
      api.protoProperty('body');
      const {request} = v.opts;
      request._setBody(v.exp = "a%20%2Bb=q%5Ba%5D&foo=bar");

      request.headers['content-type'] = 'application/data';

      class MyController extends BaseController {
        $parser() {}
      }
      const ctl = new MyController(v.opts);

      const ans = ctl.body;

      assert.equals(ans, v.exp);
      assert.same(ans, ctl.body);
    },

    "test redirect"() {
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

      const ctl = new MyController(opts);


      assert.calledWith(opts.response.writeHead, 302, {Location: '/foo/1234'});
      assert.calledWithExactly(opts.response.end);
    },

    "test error"() {
      /**
       * Send an error response to the client;
       *
       * @param code the statusCode to send.
       *
       * @param message the response body to send.
       **/
      api.protoMethod('error');
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {
          this.error(418, 'Short and stout');
          return 'new';
        }
      }
      const ctl = new MyController(v.opts);


      refute.called(response.writeHead);
      assert.calledOnceWith(response.end, 'Short and stout');
      assert.equals(response.statusCode, 418);
    },

    "test not modified"() {
      const {opts} = v;
      opts.view = {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }};
      opts.pathParts = [];
      opts.request.headers['if-none-match'] = '  W/"'+BaseController.defaultETag + '"\n\n';

      class MyController extends BaseController {
        get App() {return genericApp()}
      }
      new MyController(opts);

      assert.same(opts.response.statusCode, 304);
    },

    "test No Content"() {
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {}
      }

      new MyController(v.opts);

      assert.same(response.statusCode, 204);
      assert.calledWithExactly(response.end);
    },

    "test html response"() {
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {return Dom.h({html: {body: 'foo'}})}
      }

      new MyController(v.opts);

      assert.calledWith(response.writeHead, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': 45,
        ETag: TH.match(/W\/"h[0-9]+"/),
      });

      assert.calledWithExactly(response.end, '<html><body>foo</body></html>');
    },

    "test json response"() {
      const {response} = v.opts;

      class MyController extends BaseController {
        $parser() {return 'foo'}
        foo() {return {html: {body: 'foo'}}}
      }

      new MyController(v.opts);

      assert.calledWith(response.writeHead, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': 23,
      });
      refute.called(response.write);
      assert.calledWithExactly(response.end, '{"html":{"body":"foo"}}');
    },

    "test method"() {
      const {opts} = v;
      opts.request.method = 'FOO';

      const foo = stub();

      class MyController extends BaseController {
        foo() {foo(this)}
      }

      MyController.App = genericApp();

      const controller = new MyController(opts);

      assert.calledWith(foo, controller);
    },

    "test default show"() {
      const {opts} = v;
      opts.pathParts = ['123'];

      class MyController extends BaseController {
        get eTag() {return "x123"}
      }

      opts.view = {Show: {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }}};

      MyController.App = genericApp();

      new MyController(opts);

      assert.calledWith(opts.response.writeHead, 200, {
        'Content-Length': 43, 'Content-Type': 'text/html; charset=utf-8',
        ETag: 'W/\"x123\"',
      });
      assert.calledWith(opts.response.end, '<main><div>123</div></main>');
    },

    "test override show"() {
      /**
       * The default show action controller. Override this method to control the show action.
       **/
      api.protoMethod('show');
      stubProperty(BaseController, 'App', {value: genericApp()});

      const {opts} = v;
      opts.view = {Show: {$render(ctl) {
        return Dom.h({div: ctl.params.book.title});
      }}};
      opts.pathParts = ['123'];

      class Book {
        static findById(id) {
          assert.same(id, '123');
          return {title: 'Leviathan Wakes'};
        }
      }

      //[
      class BookController extends BaseController {
        show() {
          this.params.book = Book.findById(this.params.id);
          super.show();
        }
      };
      //]

      new BookController(opts);

      assert.calledWith(opts.response.end, '<main><div>Leviathan Wakes</div></main>');
    },

    "test default new"() {
      const {opts} = v;
      opts.pathParts = ['new'];

      class MyController extends BaseController {
        get eTag() {return "x123"}
      }

      opts.view = {New: {$render(ctl) {
        return Dom.h({div: ctl.data || 'new page'});
      }}};

      MyController.App = genericApp();

      new MyController(opts);

      assert.calledWith(opts.response.writeHead, 200, {
        'Content-Length': 48, 'Content-Type': 'text/html; charset=utf-8',
        ETag: 'W/\"x123\"',
      });
      assert.calledWith(opts.response.end, '<main><div>new page</div></main>');
    },

    "test override new"() {
      /**
       * The default new action controller. Override this method to control the new action.
       **/
      api.protoMethod('new');
      stubProperty(BaseController, 'App', {value: genericApp()});

      const {opts} = v;
      opts.view = {New: {$render(ctl) {
        return Dom.h({div: ctl.params.book.author});
      }}};
      opts.pathParts = ['new'];

      class Book {
        static build({author}) {
          return {author};
        }
      }

      const lastAuthor = 'James S. A. Corey';

      //[
      class BookController extends BaseController {
        new() {
          this.params.book = Book.build({author: lastAuthor});
          super.new();
        }
      };
      //]

      new BookController(opts);

      assert.calledWith(opts.response.end, `<main><div>${lastAuthor}</div></main>`);
    },

    "test override $parser"() {
      /**
       * The default request parser. Override this method for full control of the request.
       **/
      api.protoMethod('$parser');
      stubProperty(BaseController, 'App', {value: genericApp()});
      const {opts} = v;
      opts.request.method = 'DELETE';

      const Auth = {canDelete() {return false}};

      //[
      class BookController extends BaseController {
        $parser() {
          if (this.method === 'DELETE' && ! Auth.canDelete(this)) {
            this.error(403, "You do not have delete access");
            return;
          }

          super.$parser();
        }
      };
      //]

      new BookController(opts);

      assert.calledWith(opts.response.end, 'You do not have delete access');
    },

    "test render"() {
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
      };
      //]

      new HelloController(opts);

      assert.calledWith(
        opts.response.end,
        '<html><head><title>My First App</title></head><body><div>Hello world</div></body></html>');
    },

    "test renderHTML"() {
      /**
       * Respond to the client with the rendered HTML content.
       *
       * @param html the html element to render.
       **/
      api.protoMethod('renderHTML');
      const {opts} = v;

      //[
      class HelloController extends BaseController {
        $parser() {
          this.renderHTML(Dom.h({div: 'Hello world'}));
        }
      };
      //]

      new HelloController(opts);

      assert.calledWith(
        opts.response.end,
        '<div>Hello world</div>');
    },

    "test $parser, render"() {
      const {opts} = v;
      opts.pathParts = ['foo', '123'];

      class MyController extends BaseController {
        $parser() {
          return "foo";
        }

        foo() {
          this.render(Dom.h({div: ['foo€']}), {layout: {$render({content}) {
            return Dom.h({main: content});
          }}});
        }
      }

      const controller = new MyController(opts);

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
      assert.calledWith(opts.response.end, '<main><div>foo€</div></main>');
    },

    "test DOCTYPE supplied"() {
      const {opts} = v;
      opts.pathParts = [];

      class MyController extends BaseController {
        index() {
          this.render(Dom.h({body: ['x']}), {layout: {$render({content}) {
            return {outerHTML: '<!CUSTOM>'+content.outerHTML};
          }}});
        }
      }

      const controller = new MyController(opts);

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
      assert.calledWith(opts.response.end, '<!CUSTOM><body>x</body>');
    },
  });
});
