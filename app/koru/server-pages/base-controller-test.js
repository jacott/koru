define(function (require, exports, module) {
  const Dom             = require('koru/dom');
  const TH              = require('koru/test');
  const util            = require('koru/util');

  const {stub, spy, onEnd} = TH;

  const sut  = require('./base-controller');
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
        request: {
          headers: {},
        },
        response: {
          writeHead: stub(),
          write: stub(),
          end: stub(),
        },
        params: {},
      };

    },

    tearDown() {
      v = null;
    },

    "test defaultETag"() {
      assert.match(sut.defaultETag, /^h[0-9]+$/);
    },

    "test not modified"() {
      const {opts} = v;
      opts.view = {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }};
      opts.pathParts = [];
      opts.request.headers['if-none-match'] = '  W/"'+sut.defaultETag + '"\n\n';

      class MyController extends sut {
        get App() {return genericApp()}
      }
      new MyController(opts);

      assert.same(opts.response.statusCode, 304);

    },

    "test default show"() {
      const {opts} = v;
      opts.pathParts = ['123'];

      class MyController extends sut {
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

      /** implement show **/

      opts.response.end.reset();
      MyController.prototype.show = function () {
        this.params.id = '456';
      };

      new MyController(opts);

      assert.calledWith(opts.response.end, '<main><div>456</div></main>');
    },

    "test $parser, render"() {
      const {opts} = v;
      opts.pathParts = ['foo', '123'];

      class MyController extends sut {
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

      class MyController extends sut {
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
        'Content-Length': 39,
        'Content-Type': 'text/html; charset=utf-8',
        ETag: TH.match.string,
      });
      refute.called(opts.response.write);
      assert.calledWith(opts.response.end, '<!CUSTOM><body>x</body>');
    },
  });
});
