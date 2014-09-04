isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('../test');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      delete Dom.Foo;
      Dom.removeChildren(document.body);
      v = null;
    },

    "test html": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      document.body.appendChild(elm);

      document.body.appendChild(Dom.html({"class": 'bar', id: "s123", tag: 'section', span: {text: "Goodbye"}}));

      assert.dom('#top', function () {
        assert.same(elm, this);

        assert.dom('>.foo', function () { // doubles as a test for assert.dom directChild
          assert.dom('>.bar>button#sp', 'Hello');
        });
      });

      assert.dom('body', function () {
        assert.dom('section#s123.bar', 'Goodbye', function () {
          assert.dom('span', 'Goodbye');
        });
      });

      assert.same(Dom.html(elm), elm);

      var nested = Dom.html({content: ['<div>hello</div>', elm]});
      assert.same(nested.firstChild.nextSibling, elm);
      assert.same(nested.firstChild.textContent, 'hello');
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

    "test classList": function () {
      var elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClass(elm, 'foo');
      assert(Dom.hasClass(elm, 'foo'));

      Dom.addClass(null, 'foo');
      Dom.addClass(elm, 'foo');
      Dom.addClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'bar'));

      Dom.removeClass(null, 'bar');
      Dom.removeClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      refute(Dom.hasClass(elm, 'bar'));

      // test toggle
      assert(Dom.toggleClass(elm, 'bar'));
      assert(Dom.hasClass(elm, 'bar'));

      refute(Dom.toggleClass(elm, 'bar'));
      refute(Dom.hasClass(elm, 'bar'));
    },

    "test parentOf": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      assert.same(Dom.parentOf(elm, elm.querySelector('.bar')), elm);
      assert.same(Dom.parentOf(elm.querySelector('.bar'), elm), null);
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
