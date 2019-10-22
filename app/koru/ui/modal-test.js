isClient && define((require, exports, module)=>{
  'use strict';
  const Dom             = require('../dom');
  const TH              = require('./test-helper');

  const {stub, spy} = TH;

  const sut = require('./modal');

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      TH.domTearDown();
    });

    // see SelectMenu for more comprehensive testing of positioning

    test("appendBelow", ()=>{
      stub(sut, 'append');

      sut.appendBelow('opts');

      assert.calledWith(sut.append, 'below', 'opts');
    });

    test("appendAbove", ()=>{
      stub(sut, 'append');

      sut.appendAbove('opts');

      assert.calledWith(sut.append, 'above', 'opts');
    });

    test("supply position", ()=>{
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      Dom.setCtx(popup);
      sut.append('below', {container: popup, popup, boundingClientRect: {
        top: 10, left: 15, height: 20, width: 30}});
      assert.dom('.popup', function () {
        assert.cssNear(this, 'left', 15);
        assert.cssNear(this, 'top', 30);
      });
    });

    test("popup", ()=>{
      spy(sut, 'init');
      const page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      Dom.setCtx(popup);
      let ibox;
      assert.dom('input', function () {
        sut.appendBelow({container: popup, origin: this, popup: popup});
        ibox = this.getBoundingClientRect();
      });
      assert.dom('body', function () {
        assert.dom('>.popup', function () {
          assert.cssNear(this, 'left', ibox.left);
          assert.cssNear(this, 'top', ibox.top + ibox.height);
        });
      });
      assert.called(sut.init);
    });


    test("cancel", ()=>{
      const popup = Dom.h({class: 'popup', $style: 'position:absolute', div: 'popup'});
      const page = Dom.h({div: popup, class: 'page'});
      Dom.setCtx(page);

      after(()=>{TH.pointerDownUp(popup)});

      sut.append('below', {container: page, origin: document.body});
      assert.dom('.popup');
      TH.trigger(popup, 'click');
      assert.dom('.page');

      TH.trigger(page, 'click');
      refute.dom('.page');
    });

    test("closes with destroyMeWith", ()=>{
      const elm = Dom.h({div: {div: "subject"}, id: 'subject'});
      const elmCtx = Dom.setCtx(elm);
      document.body.appendChild(elm);

      const dep = Dom.h({div: {section: "dep"}, id: 'dep'});
      const depCtx = Dom.setCtx(dep);

      sut.appendBelow({
        container: dep,
        destroyMeWith: elm.firstChild,
        origin: elm,
      });

      assert.dom('#dep');
      Dom.remove(elm);
      refute.dom('#dep');
    });

    test("handleTab", ()=>{
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
      spy(ctx, 'onDestroy');

      after(()=>{TH.pointerDownUp(container)});

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
        const focus = spy(Object.getPrototypeOf(this), 'focus');
        TH.keydown(this, 9);
        refute.called(focus);
        TH.keydown(this, 9, {shiftKey: true});
        assert.called(focus);
      });

      assert.dom('.endTab', function () {
        assert.same(document.activeElement, this);
      });
    });

    test("nesting", ()=>{
      spy(sut, 'init');
      const page = Dom.h({div: ['text', {input: ''}]});
      document.body.appendChild(page);
      const popup0 = Dom.h({class: 'glassPane', div: {
        class: 'popup0', $style: 'position:absolute', div: 'popup0'}});
      Dom.setCtx(popup0);
      const popup1 = Dom.h({class: 'glassPane', div: {
        class: 'popup1', $style: 'position:absolute', div: 'popup1'}});
      Dom.setCtx(popup1);
      const popup2 = Dom.h({class: 'glassPane', div: {
        class: 'popup2', $style: 'position:absolute', div: 'popup2'}});
      Dom.setCtx(popup2);
      let ibox;
      assert.dom('input', function () {
        sut.appendBelow({container: popup0, origin: this});
        sut.appendBelow({container: popup1, origin: popup0});
        sut.appendBelow({container: popup2, origin: popup1});

        ibox = this.getBoundingClientRect();
      });
      const keydown = stub();
      document.body.addEventListener('keydown', keydown);
      after(()=>{document.body.removeEventListener('keydown', keydown)});
      assert.dom('body', function () {
        assert.dom('>.glassPane:nth-last-child(3)>.popup0', function () {
          assert.cssNear(this, 'left', ibox.left);
          assert.cssNear(this, 'top', ibox.top + ibox.height);
        });
        assert.dom('>.glassPane:last-child>.popup2', function () {
          assert.same(this, popup2.firstChild);
        });
        const ev = TH.buildEvent('keydown', {which: 27});
        spy(ev, 'stopImmediatePropagation');
        spy(ev, 'preventDefault');
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
        refute.called(keydown);
        TH.trigger(this, 'keydown', {which: 27});
        assert.calledOnce(keydown);
      });
      assert.calledThrice(sut.init);
    });
  });
});
