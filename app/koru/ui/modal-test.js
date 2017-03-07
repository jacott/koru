isClient && define(function (require, exports, module) {
  const Dom = require('../dom');
  const TH  = require('./test-helper');

  const sut = require('./modal');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    // see SelectMenu for more comprehensive testing of positioning

    "test appendBelow"() {
      test.stub(sut, 'append');

      sut.appendBelow('opts');

      assert.calledWith(sut.append, 'below', 'opts');
    },

    "test appendAbove"() {
      test.stub(sut, 'append');

      sut.appendAbove('opts');

      assert.calledWith(sut.append, 'above', 'opts');
    },

    "test supply position"() {
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      sut.append('below', {container: popup, popup: popup, boundingClientRect: {top: 10, left: 15, height: 20, width: 30}});
      assert.dom('.popup', function () {
        assert.cssNear(this, 'left', 15);
        assert.cssNear(this, 'top', 30);
      });
    },

    "test popup"() {
      test.spy(sut, 'init');
      const page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
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

    "test cancel"() {
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      const page = Dom.h({div: popup, class: 'page'});
      Dom.setCtx(page);

      test.onEnd(function () {TH.pointerDownUp(popup)});

      sut.append('below', {container: page, origin: document.body});
      assert.dom('.popup');
      TH.trigger(popup, 'touchstart');
      TH.trigger(popup, 'pointerdown');
      assert.dom('.page');

      TH.trigger(page, 'pointerdown');
      refute.dom('.page');

      Dom.setCtx(page);
      sut.append('below', {container: page, origin: document.body});
      assert.dom('.popup');
      TH.trigger(page, 'touchstart');
      refute.dom('.page');
    },

    "test closes with destroyMeWith"() {
      v.elm = Dom.h({div: {div: "subject"}, id: 'subject'});
      v.elmCtx = Dom.setCtx(v.elm);
      document.body.appendChild(v.elm);

      v.dep = Dom.h({div: {section: "dep"}, id: 'dep'});
      v.depCtx = Dom.setCtx(v.dep);

      sut.appendBelow({
        container: v.dep,
        destroyMeWith: v.elm.firstChild,
        origin: v.elm,
      });

      assert.dom('#dep');
      Dom.remove(v.elm);
      refute.dom('#dep');
    },

    "test repositioning"() {
      const container = Dom.h({class: 'glassPane', div: {class: 'popup', $style: 'position:absolute', div: {input: ''}}});
      const ctx = Dom.setCtx(container);
      test.spy(ctx, 'onDestroy');

      test.onEnd(function () {TH.pointerDownUp(container)});

      const options = sut.appendBelow({
        container: container,
        origin: document.body,
      });

      assert.same(sut.reposition('above', options), options);

      assert.calledOnce(ctx.onDestroy);
    },

    "test handleTab"() {
      const container =  Dom.h({
        class: 'glassPane', div: {
          form: [
            {span: '', class: 'startTab', $tabindex: 0},
            {input: ''},
            {button: 'foo'},
            {span: '', class: 'endTab', $tabindex: 0},
          ],
        },
      });
      const ctx = Dom.setCtx(container);
      test.spy(ctx, 'onDestroy');

      test.onEnd(function () {TH.pointerDownUp(container)});

      const options = sut.appendBelow({
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

    "test nesting"() {
      test.spy(sut, 'init');
      const page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      const popup0 = Dom.h({class: 'glassPane', div: {class: 'popup0', $style: 'position:absolute', div: 'popup0'}});
      Dom.setCtx(popup0);
      const popup1 = Dom.h({class: 'glassPane', div: {class: 'popup1', $style: 'position:absolute', div: 'popup1'}});
      Dom.setCtx(popup1);
      const popup2 = Dom.h({class: 'glassPane', div: {class: 'popup2', $style: 'position:absolute', div: 'popup2'}});
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
        const ev = TH.buildEvent('keydown', {which: 27});
        test.spy(ev, 'stopImmediatePropagation');
        test.spy(ev, 'preventDefault');
        TH.trigger(this, ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);

        refute.dom('.popup2');

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
