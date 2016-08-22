define(function (require, exports, module) {
  /**
   * Adorn {#koru/dom/base} with extra utility functions
   **/
  var test, v;
  const Ctx = require('koru/dom/ctx');
  const TH  = require('koru/test-helper');
  const api = require('koru/test/api');
  const Dom = require('./dom-client');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      Dom.flushNextFrame();
      document.body.removeAttribute('class');
      Dom.removeChildren(document.body);
      delete Dom.Foo;
      v = null;
    },

    "test isInView"() {
      /**
       * Determine if a element is within the viewable area of a
       * `region`.
       *
       * @param {koru/dom/html-doc::Element|object} region either a Dom `Element` or a `boundingClientRect`
       **/
      api.method('isInView');
      var x = Dom.h({$style: "position:absolute;left:-12px;width:20px;height:30px",
                     div: "x"});
      document.body.appendChild(x);

      refute(Dom.isInView(x, document.body));
      x.style.left = "-9px";
      assert(Dom.isInView(x, document.body));

      x.style.bottom = '-17px';
      var rect = {top: 0, bottom: 50, left: 0, right: 40};
      refute(Dom.isInView(x, rect));
      rect.bottom = 2000;
      assert(Dom.isInView(x, rect));

      api.done();

      x.style.bottom = '';
      x.style.left = '';
      x.style.right = '-9px';
      assert(Dom.isInView(x, document.body));
      x.style.right = '-11px';
      refute(Dom.isInView(x, document.body));
      x.style.right = '';

      x.style.top = '-17px';
      refute(Dom.isInView(x, document.body));
      x.style.top = "-14px";
      assert(Dom.isInView(x, document.body));
      x.style.top = '';
      x.style.bottom = '-14px';
      assert(Dom.isInView(x, document.body));
    },

    "test wheelDelta"() {
      assert.same(Dom.wheelDelta({wheelDelta: 50}), 1);
      assert.same(Dom.wheelDelta({deltaY: -50}), 1);
      assert.same(Dom.wheelDelta({deltaX: -50}), 1);

      assert.same(Dom.wheelDelta({wheelDelta: -50}), -1);
      assert.same(Dom.wheelDelta({deltaY: 50}), -1);
      assert.same(Dom.wheelDelta({deltaX: 50}), -1);
    },

    "test getClosest"() {
      document.body.appendChild(Dom.h({class: 'foo', div: {span: 'hello'}}));

      assert.dom('span', function () {
        assert.same(Dom.getClosest(this.firstChild, '.foo>span'), this);
        assert.same(Dom.getClosest(this.firstChild, '.foo'), this.parentNode);
      });
    },

    "test html string"() {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      document.body.appendChild(elm);

      assert.dom('#top', function () {
        assert.same(elm, this);

        assert.dom('>.foo', function () { // doubles as a test for assert.dom directChild
          assert.dom('>.bar>button#sp', 'Hello');
        });
      });

      assert.same(Dom.h(elm), elm);

      var nested = Dom.h({div: [Dom.html('<div>hello</div>'), elm]});
      assert.same(nested.firstChild.nextSibling, elm);
      assert.same(nested.firstChild.textContent, 'hello');
    },

    "test childElementIndex"() {
      var elm = Dom.h({});
      var child;
      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 0);

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 1);

      elm.appendChild(document.createTextNode('text'));

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 2);
    },

    "test mapToData"() {
      var elm = Dom.h({});

      'one two three'.split(' ').forEach(function (data) {
        var child = Dom.h({});
        Dom.setCtx(child, {data: data});
        elm.appendChild(child);
      });

      assert.equals(Dom.mapToData(elm.children), ['one', 'two', 'three']);
    },

    "test setClassBySuffix"() {
      var elm = {className: ''};

      Dom.setClassBySuffix('use', 'Mode', elm);
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('design', 'Mode', elm);
      assert.same(elm.className, 'designMode');

      Dom.setClassBySuffix('discard', 'Avatar', elm);
      assert.same(elm.className, 'designMode discardAvatar');

      Ctx._private.currentElement = elm;

      Dom.setClassBySuffix('use', 'Mode');
      assert.same(elm.className, 'discardAvatar useMode');

      Dom.setClassBySuffix(null, 'Avatar');
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      assert.same(elm.className, 'devMode prodMode');

      Dom.setClassBySuffix('', 'Mode', elm);
      assert.same(elm.className, '');
    },

    "test setClassByPrefix"() {
      var elm = {className: ''};

      Dom.setClassByPrefix('use', 'mode-', elm);
      assert.same(elm.className, 'mode-use');

      Dom.setClassByPrefix('design', 'mode-', elm);
      assert.same(elm.className, 'mode-design');

      Ctx._private.currentElement = elm;

      Dom.setClassByPrefix('discard', 'avatar-');
      assert.same(elm.className, 'mode-design avatar-discard');

      Dom.setClassByPrefix('use', 'mode-');
      assert.same(elm.className, 'avatar-discard mode-use');

      Dom.setClassByPrefix(null, 'avatar-');
      assert.same(elm.className, 'mode-use');
      Dom.setClassByPrefix('dev mode-prod', 'mode-');
      assert.same(elm.className, 'mode-dev mode-prod');

      Dom.setClassByPrefix('', 'mode-', elm);
      assert.same(elm.className, '');
    },

    "test getUpDownByClass"() {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div><div class="dest"></div></div></div>');

      assert.dom(elm, function () {
        assert.dom('#sp', function () {
          assert.className(Dom.getUpDownByClass(this, 'foo', 'dest'), 'dest');
        });
      });
    },

    "test searchUpFor"() {
      var top = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      assert.isNull(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return elm === top;
      }, 'bar'));
      assert.same(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return Dom.hasClass(elm, 'bar');
      }, 'bar'), top.firstChild.firstChild);

      assert.same(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return Dom.hasClass(elm, 'bar');
      }), top.firstChild.firstChild);
    },


    "test INPUT_SELECTOR, WIDGET_SELECTOR"() {
      assert.same(Dom.INPUT_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"]');
      assert.same(Dom.WIDGET_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"],button,a');
    },

    "test $getClosest"() {
      document.body.appendChild(Dom.html('<div><div class="foo"><div class="bar"><button type="button" id="sp"></button></div></div></div>'));

      var button = document.getElementById('sp');

      var foobar = document.querySelector('.foo>.bar');

      test.stub(Dom, 'getCtx').withArgs(foobar).returns('the ctx');

      assert.same(Dom.getClosest(button, '.foo>.bar'), foobar);
      assert.same(Dom.getClosestCtx(button, '.foo>.bar'), 'the ctx');
    },

    "test animationEndEventName"() {
      var name = Dom.animationEndEventName;

      assert.match(name, /^(ms|webkit)?animationend$/i);

      switch (Dom.vendorPrefix) {
      case 'webkit': assert.same(name, 'webkitAnimationEnd'); break;
      case 'ms': assert.same(name, 'MSAnimationEnd'); break;
      default: assert.same(name, 'animationend');
      }
    },

    "hideAndRemove": {
      setUp: function () {
        v.onAnimationEnd = test.stub(Dom.Ctx.prototype, 'onAnimationEnd');
      },

      "test non existent": function () {
        Dom.hideAndRemove('Foo');

        refute.called(v.onAnimationEnd);
      },

      "test remove by id": function () {
        document.body.appendChild(Dom.h({id: 'Foo'}));

        assert.dom('#Foo', function () {
          Dom.setCtx(v.elm = this, v.ctx = new Dom.Ctx);
          Dom.hideAndRemove('Foo');

          assert.className(this, 'remElm');
        });

        assert.calledWith(v.onAnimationEnd, TH.match.func);

        v.onAnimationEnd.yield(v.ctx, v.elm);

        refute.dom('#Foo');
      },

      "test remove by elm": function () {
        document.body.appendChild(v.elm = Dom.h({id: 'Foo'}));

        Dom.setCtx(v.elm, v.ctx = new Dom.Ctx);

        test.spy(v.ctx, 'onDestroy');

        Dom.hideAndRemove(v.elm);

        assert.dom('#Foo.remElm');

        assert.calledWith(v.onAnimationEnd, TH.match.func);

        v.onAnimationEnd.yield(v.ctx, v.elm);

        refute.dom('#Foo');
      },
    },

    "test forEach"() {
      var elm = Dom.html('<div></div>');
      document.body.appendChild(elm);
      for(var i = 0; i < 5; ++i) {
        elm.appendChild(Dom.html('<div class="foo">'+i+'</div>'));
      }

      var results = [];
      Dom.forEach(elm, '.foo', function (e) {
        results.push(e.textContent);
      });

      assert.same(results.join(','), '0,1,2,3,4');

      results = 0;
      Dom.forEach(document, 'div', function (e) {
        ++results;
      });

      assert.same(results, 6);
    },

    "test removeAll"() {
      test.stub(Dom, 'remove');

      var r1 = Dom.remove.withArgs(1);
      var r2 = Dom.remove.withArgs(2);

      Dom.removeAll([1, 2]);

      assert.called(r2);
      assert(r2.calledBefore(r1));
    },

    "test contains"() {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      assert.same(Dom.contains(elm, elm), elm);
      assert.same(Dom.contains(elm, elm.querySelector('.bar')), elm);
      assert.same(Dom.contains(elm.querySelector('.bar'), elm), null);
    },

    "test removeInserts"() {
      var parent = document.createElement('div');
      var elm = document.createComment('start');
      elm._koruEnd = document.createComment('end');

      assert.same(Dom.fragEnd(elm), elm._koruEnd);

      parent.appendChild(elm);
      [1,2,3].forEach(function (i) {
        parent.appendChild(document.createElement('p'));
      });
      parent.appendChild(elm._koruEnd);
      parent.appendChild(document.createElement('i'));

      test.spy(Dom, 'destroyChildren');

      Dom.removeInserts(elm);

      assert.calledThrice(Dom.destroyChildren);

      assert.same(parent.querySelectorAll('p').length, 0);
      assert.same(parent.querySelectorAll('i').length, 1);

      assert.same(elm.parentNode, parent);
      assert.same(elm._koruEnd.parentNode, parent);
    },

  });
});
