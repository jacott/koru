define(function (require, exports, module) {
  const Dom             = require('koru/dom');
  const TH              = require('koru/test');

  const {stub, spy, onEnd, util} = TH;

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
        request: {},
        response: {
          write: stub(),
          end: stub(),
        },
        params: {},
      };

    },

    tearDown() {
      v = null;
    },

    "test default show"() {
      const {opts} = v;
      opts.pathParts = ['123'];

      class MyController extends sut {
      }

      MyController.View = {Show: {$render(ctl) {
        return Dom.h({div: ctl.params.id});
      }}};

      MyController.App = genericApp();

      new MyController(opts);

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
          this.render(Dom.h({div: ['foo']}), {layout: {$render({content}) {
            return Dom.h({main: content});
          }}});
        }
      }

      const controller = new MyController(opts);

      assert.same(controller.request, opts.request);
      assert.same(controller.response, opts.response);
      assert.same(controller.pathParts, opts.pathParts);
      assert.same(controller.params, opts.params);

      assert.calledWith(opts.response.end, '<main><div>foo</div></main>');
    },
  });
});
