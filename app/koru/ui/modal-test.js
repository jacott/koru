isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./modal');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    // see SelectMenu for more comprehensive testing of positioning

    "test appendBelow": function () {
      test.stub(sut, 'append');

      sut.appendBelow('opts');

      assert.calledWith(sut.append, 'below', 'opts');
    },

    "test appendAbove": function () {
      test.stub(sut, 'append');

      sut.appendAbove('opts');

      assert.calledWith(sut.append, 'above', 'opts');
    },

    "test supply position": function () {
      var popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      sut.append('below', {container: popup, popup: popup, boundingClientRect: {top: 10, left: 15, height: 20, width: 30}});
      assert.dom('.popup', function () {
        assert.cssNear(this, 'left', 15);
        assert.cssNear(this, 'top', 30);
      });
    },

    "test popup": function () {
      test.spy(sut, 'init');
      var page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      var popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      assert.dom('input', function () {
        sut.appendBelow({container: popup, origin: this, popup: popup});
        v.ibox = this.getBoundingClientRect();
      });
      assert.dom('body', function () {
        assert.dom('>.popup', function () {
          assert.cssNear(this, 'left', v.ibox.left);
          assert.cssNear(this, 'top', v.ibox.top + v.ibox.height);
        });
      });
      refute.called(sut.init);
    },

    "test repositioning": function () {
      var container = Dom.h({class: 'glassPane', div: {class: 'popup', $style: 'position:absolute', div: {input: ''}}});
      var ctx = Dom.setCtx(container);
      test.spy(ctx, 'onDestroy');

      test.onEnd(function () {TH.mouseDownUp(container)});

      var options = sut.appendBelow({
        container: container,
        origin: document.body,
      });

      assert.same(sut.reposition('above', options), options);

      assert.calledOnce(ctx.onDestroy);
    },

    "test handleTab": function () {
      var container =  Dom.h({
        class: 'glassPane', div: {
          form: [
            {span: '', class: 'startTab', $tabindex: 0},
            {input: ''},
            {button: 'foo'},
            {span: '', class: 'endTab', $tabindex: 0},
          ],
        },
      });
      var ctx = Dom.setCtx(container);
      test.spy(ctx, 'onDestroy');

      test.onEnd(function () {TH.mouseDownUp(container)});

      var options = sut.appendBelow({
        container: container,
        handleTab: true,
        origin: document.body,
      });

      assert.dom('.endTab', function () {
        this.focus();
        TH.keydown(this, 9);
      });

      assert.dom('.startTab', function () {
        assert.same(document.activeElement, this);
        v.focus = test.spy(Object.getPrototypeOf(this), 'focus');
        TH.keydown(this, 9);
        refute.called(v.focus);
        TH.keydown(this, 9, {shiftKey: true});
        assert.called(v.focus);
      });

      assert.dom('.endTab', function () {
        assert.same(document.activeElement, this);
      });
    },

    "test nesting": function () {
      test.spy(sut, 'init');
      var page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      var popup0 = Dom.h({class: 'glassPane', div: {class: 'popup0', $style: 'position:absolute', div: 'popup0'}});
      Dom.setCtx(popup0);
      var popup1 = Dom.h({class: 'glassPane', div: {class: 'popup1', $style: 'position:absolute', div: 'popup1'}});
      Dom.setCtx(popup1);
      var popup2 = Dom.h({class: 'glassPane', div: {class: 'popup2', $style: 'position:absolute', div: 'popup2'}});
      Dom.setCtx(popup2);
      assert.dom('input', function () {
        sut.appendBelow({container: popup0, origin: this});
        sut.appendBelow({container: popup1, origin: popup0});
        sut.appendBelow({container: popup2, origin: popup1});
        v.ibox = this.getBoundingClientRect();
      });
      document.body.addEventListener('keydown', v.keydown = test.stub());
      test.onEnd(function () {
        document.body.removeEventListener('keydown', v.keydown);
      });
      assert.dom('body', function () {
        assert.dom('>.glassPane:nth-last-child(3)>.popup0', function () {
          assert.cssNear(this, 'left', v.ibox.left);
          assert.cssNear(this, 'top', v.ibox.top + v.ibox.height);
        });
        assert.dom('>.glassPane:last-child>.popup2', function () {
          assert.same(this, popup2.firstChild);
        });
        var ev = TH.buildEvent('keydown', {which: 27});
        test.spy(ev, 'stopImmediatePropagation');
        test.spy(ev, 'preventDefault');
        TH.trigger(this, ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);

        Dom.remove(popup0);
        assert.dom('>.glassPane:last-child>.popup1', function () {
          assert.same(this, popup1.firstChild);
        });
        TH.trigger(this, 'keydown', {which: 27});
        refute.dom('.glassPane');
        refute.called(v.keydown);
        TH.trigger(this, 'keydown', {which: 27});
        assert.calledOnce(v.keydown);
      });
      assert.calledThrice(sut.init);
    },
  });
});
