isClient && define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');
  const Dom             = require('./dom-client');

  const testTpl = require('koru/html!./template-compiler-test');
  const $ = Dom.current;

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      Dom.removeChildren(document.body);
      Dom.Test = undefined;
    });

    test("rendering html template", ()=>{
      refute(Dom.Test);

      Dom.newTemplate(testTpl);
      assert(Dom.Test.Foo);

      Dom.Test.Foo.$helpers({
        classes() {
          return 'e1 e2';
        },

        attrs() {
          $.element.setAttribute('data-x', 'x123');
        },

        dotted(arg) {
          $.element.setAttribute('data-dotted', arg);
        },
      });

      Dom.Test.Foo.Bar.$helpers({
        korulet() {
          return 'barId';
        },
        quick() {return 'QUICK'},
        fox() {return 'FOX'},
      });

      const elm = Dom.Test.Foo.$autoRender({
        helperName(opts) {return opts.foo+'Adam'},
        arg: {has: {parts: 'success'}}});

      document.body.appendChild(elm);

      assert.dom('div#Foo', elm =>{
        assert.same(elm.className, 'e1 e2');
        assert.dom('span[data-foo]', 'a\nb\nc\nAdam some & <other>\u00a0text', span =>{
          assert.equals(span.id, 'barId\n           ');
          assert.equals(span.getAttribute('data-foo'), 'theQUICKbrownFOX');
        });
        assert.same(elm.getAttribute('data-x'), 'x123');
        assert.same(elm.getAttribute('data-dotted'), 'success');
      });
    });
  });
});
