define((require, exports, module)=>{
  'use strict';
  /**
   * Helper for build a selectable list.
   **/
  const Dom             = require('koru/dom');
  const api             = require('koru/test/api');
  const TH              = require('./test-helper');

  const {stub, spy, util, match: m} = TH;

  const ListSelector = require('./list-selector');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      TH.domTearDown();
    });

    test("attach", ()=>{
      /**
       * Attach events for highlighting and selecting a list element.

       * @param ul the parent element for list items (usally a `<ul class="ui-ul">` element)

       * @param ctx  The events are detached when this `ctx` is destroyed.

       * @param keydownElm the element to listen for `keydown` events from.

       * @param onClick called with the current element and the causing event when clicked or enter
       * pressed on a selectable element.

       * @param onHover called with the `target` and the causing event when `pointerover` selectable
       * element.
       **/
      api.method();

      //[
      const ul = Dom.h({
        tabindex: 0,
        class: 'ui-ul',
        ul: [
          {li: ['one']},
          {li: ['two'], class: 'disabled'},
          {li: ['sep'], class: 'sep'},
          {li: ['hidden'], class: 'hide'},
          {li: ['three']},
        ]
      });
      const ctx = Dom.setCtx(ul);
      document.body.append(ul);
      const onClick = stub();

      ListSelector.attach({
        ul,
        onClick,
      });

      ul.focus();
      assert.dom(ul, ()=>{
        // select via keyboard
        TH.keydown(ul, 40); // down
        assert.dom('.selected', 'one');
        TH.keydown(ul, 40); // down
        assert.dom('.selected', 'three');
        TH.keydown(ul, 38); // up
        assert.dom('.selected', 'one');

        // onClick via keyboard
        refute.called(onClick);
        TH.keydown(ul, 13);// enter
        assert.calledWith(onClick, ul.firstChild, m(e => e.type === 'keydown'));

        // pointerover selects too
        TH.trigger(ul.lastChild, 'pointerover');
        assert.dom('.selected', 'three');
        TH.trigger(ul.firstChild, 'pointerover');
        assert.dom('.selected', 'one');

        TH.trigger(ul.firstChild.nextSibling, 'pointerover');
        assert.dom('.selected', 'one');

        onClick.reset();
        // onClick via pointer
        TH.click(ul.lastChild);
        assert.calledWith(onClick, ul.lastChild, m(e => e.type === 'click'));
      });

      ul.querySelector('.selected').classList.remove('selected');
      Dom.remove(ul); // destroy event listeners
      //]

      document.body.append(ul);
      TH.trigger(ul.firstChild, 'pointerover');
      refute.dom('.selected');

      //[
      // override defaults
      const div = Dom.h({div: ul});
      const divCtx = Dom.setCtx(div);
      document.body.append(div);
      const onHover = stub();

      ListSelector.attach({
        ul,
        ctx: divCtx,
        keydownElm: document,
        onClick,
        onHover,
      });
      assert.dom(ul, ()=>{
        TH.keydown(document, 38); // up
        assert.dom('.selected', 'three'); // select from bottom of list

        TH.trigger(ul.firstChild, 'pointerover');
        assert.calledWith(onHover, ul.firstChild, m(e => e.type === 'pointerover'));
      });
      //]
    });

    test("keydownHandler", ()=>{
      /**
       * Used by {#.attach} to listen for `Up/Down` events to change the selected item and `Enter`
       * events to choose the selected item.

       * @param event the `keydown` event to process

       * @param ul the list contains `li` items to select

       * @param selected used to determine current selected

       * @param onClick callback for when `Enter` is pressed with a selected item.
       **/
      api.method();
      //[
      const ul = Dom.h({
        tabindex: 0,
        class: 'ui-ul',
        ul: [
          {li: ['one']},
          {li: ['two'], class: 'disabled'},
          {li: ['sep'], class: 'sep'},
          {li: ['hidden'], class: 'hide'},
          {li: ['three']},
        ]
      });
      const selected = ul.getElementsByClassName('selected');
      const onClick = stub();

      ListSelector.keydownHandler(
        Dom.buildEvent('keydown', {which: 40}),
        ul
      );

      const event2 = Dom.buildEvent('keydown', {which: 13});
      ListSelector.keydownHandler(
        event2,
        ul,
        selected,
        onClick
      );

      assert.calledOnceWith(onClick, ul.firstChild, event2);
      //]
    });

  });
});
