isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('koru/test-helper');
  var Dom = require('./dom-client');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      Dom.flushNextFrame();
      document.body.className = '';
      Dom.removeChildren(document.body);
      delete Dom.Foo;
      v = null;
    },

    "test isInView": function () {
      var x = Dom.html({style: "position:absolute;left:-12px;width:20px;height:30px", content: "x"});
      document.body.appendChild(x);

      refute(Dom.isInView(x, document.body));
      x.style.left = "-9px";
      assert(Dom.isInView(x, document.body));

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
      x.style.bottom = '-17px';
      var rect = {top: 0, bottom: 50, left: 0, right: 40};
      refute(Dom.isInView(x, rect));
      rect.bottom = 2000;
      assert(Dom.isInView(x, rect));
    },

    "test wheelDelta": function () {
      assert.same(Dom.wheelDelta({wheelDelta: 50}), 1);
      assert.same(Dom.wheelDelta({deltaY: -50}), 1);
      assert.same(Dom.wheelDelta({deltaX: -50}), 1);

      assert.same(Dom.wheelDelta({wheelDelta: -50}), -1);
      assert.same(Dom.wheelDelta({deltaY: 50}), -1);
      assert.same(Dom.wheelDelta({deltaX: 50}), -1);
    },

    "test getClosest": function () {
      document.body.appendChild(Dom.html({class: 'foo', content: [{tag: 'span', text: 'hello'}]}));

      assert.dom('span', function () {
        assert.same(Dom.getClosest(this.firstChild, '.foo>span'), this);
        assert.same(Dom.getClosest(this.firstChild, '.foo'), this.parentNode);
      });
    },

    "test html string": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      document.body.appendChild(elm);

      assert.dom('#top', function () {
        assert.same(elm, this);

        assert.dom('>.foo', function () { // doubles as a test for assert.dom directChild
          assert.dom('>.bar>button#sp', 'Hello');
        });
      });

      assert.same(Dom.html(elm), elm);

      var nested = Dom.html({content: ['<div>hello</div>', elm]});
      assert.same(nested.firstChild.nextSibling, elm);
      assert.same(nested.firstChild.textContent, 'hello');
    },

    "test childElementIndex": function () {
      var elm = Dom.html({});
      var child;
      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 0);

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 1);

      elm.appendChild(document.createTextNode('text'));

      elm.appendChild(child = document.createElement('b'));
      assert.same(Dom.childElementIndex(child), 2);
    },

    "test mapToData": function () {
      var elm = Dom.html({});

      'one two three'.split(' ').forEach(function (data) {
        var child = Dom.html({});
        Dom.setCtx(child, {data: data});
        elm.appendChild(child);
      });

      assert.equals(Dom.mapToData(elm.children), ['one', 'two', 'three']);
    },

    "test setClassBySuffix": function () {
      var elm = {className: ''};

      Dom.setClassBySuffix('use', 'Mode', elm);
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('design', 'Mode', elm);
      assert.same(elm.className, 'designMode');

      Dom.setClassBySuffix('discard', 'Avatar', elm);
      assert.same(elm.className, 'designMode discardAvatar');

      Dom._private.currentElement = elm;

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

    "test setClassByPrefix": function () {
      var elm = {className: ''};

      Dom.setClassByPrefix('use', 'mode-', elm);
      assert.same(elm.className, 'mode-use');

      Dom.setClassByPrefix('design', 'mode-', elm);
      assert.same(elm.className, 'mode-design');

      Dom._private.currentElement = elm;

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

    "test getUpDownByClass": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div><div class="dest"></div></div></div>');

      assert.dom(elm, function () {
        assert.dom('#sp', function () {
          assert.className(Dom.getUpDownByClass(this, 'foo', 'dest'), 'dest');
        });
      });
    },

    "test searchUpFor": function () {
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


    "test INPUT_SELECTOR, WIDGET_SELECTOR": function () {
      assert.same(Dom.INPUT_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"]');
      assert.same(Dom.WIDGET_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"],button,a');
    },

    "test $getClosest": function () {
      document.body.appendChild(Dom.html('<div><div class="foo"><div class="bar"><button type="button" id="sp"></button></div></div></div>'));

      var button = document.getElementById('sp');

      var foobar = document.querySelector('.foo>.bar');

      test.stub(Dom, 'getCtx').withArgs(foobar).returns('the ctx');

      assert.same(Dom.getClosest(button, '.foo>.bar'), foobar);
      assert.same(Dom.getClosestCtx(button, '.foo>.bar'), 'the ctx');
    },

    "test animationEndEventName": function () {
      var name = Dom.animationEndEventName;

      assert.match(name, /^(ms|webkit)?animationend$/i);

      switch (Dom.vendorPrefix) {
      case 'webkit': assert.same(name, 'webkitAnimationEnd'); break;
      case 'ms': assert.same(name, 'MSAnimationEnd'); break;
      default: assert.same(name, 'animationend');
      }
    },
  });
});
