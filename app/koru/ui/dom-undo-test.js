isClient && define((require, exports, module) => {
  'use strict';
  /**
   * Manage a undo/redo list of changes to a [Node](mdn:/API/Node)
   */
  const Dom             = require('koru/dom');
  const TH              = require('./test-helper');

  const {stub, spy, util, match: m} = TH;

  const DomUndo = require('./dom-undo');

  const htj = Dom.htmlToJson;

  const {range$} = DomUndo[isTest];

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    let input;
    beforeEach(() => {
      input = Dom.h({div: [], contenteditable: true});
      Dom.setCtx(input);
      document.body.appendChild(input);
    });
    afterEach(() => {
      TH.domTearDown();
      input = undefined;
    });

    test('no change', () => {
      const undo = new DomUndo(input);
      const changed = stub();
      after(undo.onChange(changed));

      const tn = document.createTextNode('hello');
      input.appendChild(tn);
      tn.remove();
      undo.recordNow();

      assert.equals(undo.undos, []);
      assert.equals(undo.redos, []);

      assert.isFalse(undo.undo());
      assert.isFalse(undo.redo());
      refute.called(changed);
    });

    test('add then attribute change', () => {
      const n = document.createElement('br');

      const undo = new DomUndo(input);

      input.appendChild(n);

      n.setAttribute('title', 'foo');

      undo.undo();
      undo.redo();
      undo.undo();

      assert.same(input.firstChild, null);

      undo.redo();

      assert.equals(htj(input).div, {title: 'foo', br: []});
    });

    test('onInputChange', () => {
      const undo = new DomUndo(input);
      const change = stub();
      after(undo.monitor(change));
      input.textContent += '@';
      undo.recordNow();
      assert.calledOnceWith(
        change,
        m((muts) => muts.length === 1 && muts[0].addedNodes[0].textContent === '@'),
      );
    });

    test('pause, unpause, onChange', () => {
      const undo = new DomUndo(input);
      const change = stub();
      after(undo.onChange(change));

      undo.recordNow();

      refute.called(change);

      input.appendChild(Dom.h('1'));

      undo.recordNow();

      assert.calledWith(change, undo);
      change.reset();

      assert.isFalse(undo.paused);
      undo.pause();
      assert.isTrue(undo.paused);

      input.appendChild(Dom.h({i: '2'}));
      undo.recordNow();
      input.appendChild(Dom.h({b: '3'}));
      undo.recordNow();
      refute.called(change);

      input.appendChild(Dom.h({i: '4'}));

      undo.unpause();
      assert.isFalse(undo.paused);
      assert.calledOnceWith(change, undo);
      change.reset();

      undo.undo();
      assert.equals(htj(input).div, ['1']);
      assert.calledOnceWith(change, undo);
      change.reset();

      undo.redo();
      assert.equals(htj(input).div, ['1', {i: '2'}, {b: '3'}, {i: '4'}]);
      assert.calledOnceWith(change, undo);
      change.reset();
    });

    test('atomic add, change, remove', () => {
      const undo = new DomUndo(input);
      const tn = document.createTextNode('1');
      input.appendChild(tn);

      undo.recordNow();
      assert.equals(undo.undos, [[{node: m.is(tn), remove: true}]]);

      tn.textContent = '2';
      undo.recordNow();
      assert.equals(undo.undos, [[{node: m.is(tn), remove: true}], [{node: m.is(tn), text: '1'}]]);

      tn.remove();
      undo.recordNow();
      assert.equals(undo.undos, [[{node: m.is(tn), remove: true}], [{node: m.is(tn), text: '1'}], [{
        node: m.is(tn),
        parent: m.is(input),
        before: null,
      }]]);

      // add-change-remove
      input.appendChild(tn);
      tn.textContent = '3';
      tn.remove();

      undo.recordNow();

      undo.undo();
      assert.equals(htj(input).div, ['2']);
    });

    test('attribute change', () => {
      const n = document.createElement('b');
      n.textContent = 'bold';
      input.appendChild(n);

      const undo = new DomUndo(input);

      n.setAttribute('data-foo', 'abc');
      n.style.setProperty('margin-left', '10px');
      n.setAttributeNS('my-ns', 'x1', 'abc');

      undo.recordNow();

      n.style.setProperty('margin-left', '15px');
      n.removeAttribute('data-foo');

      undo.recordNow();

      assert.equals(undo.undos, [[{
        node: m.is(n),
        attrs: {'': {'data-foo': null, style: null}, 'my-ns': {x1: null}},
      }], [{node: m.is(n), attrs: {'': {'data-foo': 'abc', 'style': 'margin-left: 10px;'}}}]]);

      undo.undo();

      assert.equals(htj(n), {
        b: ['bold'],
        style: 'margin-left: 10px;',
        x1: 'abc',
        'data-foo': 'abc',
      });

      undo.undo();

      assert.equals(htj(n), {b: 'bold'});

      assert.same(n.getAttributeNS('my-ns', 'x1'), null);

      undo.redo();

      assert.equals(htj(n), {
        b: ['bold'],
        style: 'margin-left: 10px;',
        x1: 'abc',
        'data-foo': 'abc',
      });

      undo.redo();

      assert.equals(htj(n), {b: ['bold'], style: 'margin-left: 15px;', x1: 'abc'});

      assert.same(n.getAttributeNS('my-ns', 'x1'), 'abc');

      n.setAttribute('data-foo', 'xyz');

      n.remove();

      undo.undo();
      undo.undo();

      assert.same(n.getAttribute('data-foo'), 'abc');

      undo.redo();
      undo.redo();

      assert.same(n.getAttribute('data-foo'), 'xyz');
    });

    test('combines small text changes', () => {
      const tn = document.createTextNode('hello');
      input.appendChild(tn);

      input.focus();
      TH.setRange(tn, 5);
      const undo = new DomUndo(input);

      tn.textContent = 'hello world';
      undo.recordNow();
      tn.textContent = 'hello earth world';
      undo.recordNow();
      TH.setRange(tn, 3);
      undo.saveCaret();

      assert.equals(undo.undos, [[{node: m.is(tn), text: 'hello'}]]);
      assert.equals(undo.undos[0][range$], [m.is(tn), 5]);

      tn.textContent = 'this is hello earth world big change';
      undo.recordNow();
      TH.setRange(tn, 4);
      undo.saveCaret();

      assert.same(undo.undos.length, 2);
      assert.equals(undo.undos[1], [{node: m.is(tn), text: 'hello earth world'}]);
      assert.equals(undo.undos[1][range$], [m.is(tn), 3]);
    });

    test('text change', () => {
      const tn = document.createTextNode('hello');
      input.appendChild(tn);

      input.focus();
      TH.setRange(tn, 5);
      const undo = new DomUndo(input);

      tn.textContent = 'hello wor';
      tn.textContent = 'hello world';
      TH.setRange(tn, 11);

      undo.recordNow();

      assert.equals(undo.undos, [[{node: m.is(tn), text: 'hello'}]]);
      assert.equals(undo.undos[0][range$], [m.is(tn), 5]);
      assert.equals(undo.redos, []);

      undo.undo();

      assert.same(tn.textContent, 'hello');

      assert.equals(Dom.getRange().startOffset, 5);

      assert.equals(undo.redos, [[{node: m.is(tn), text: 'hello world'}]]);
      assert.equals(undo.redos[0][range$], [m.is(tn), 11]);
      assert.equals(undo.undos, []);

      undo.redo();

      assert.same(tn.textContent, 'hello world');
      assert.equals(undo.undos, [[{node: m.is(tn), text: 'hello'}]]);
      assert.equals(undo.undos[0][range$], [m.is(tn), 5]);
      assert.equals(undo.redos, []);
    });

    test('add remove order', () => {
      const one = Dom.h('one'),
        br1 = Dom.h({class: 'br1', br: ''}),
        two = Dom.h('two'),
        b = Dom.h({b: '2'}),
        br2 = Dom.h({class: 'br2', br: ''}),
        three = Dom.h('three');

      const pre = Dom.h({class: 'pre1', pre: [[one, br1, two, b, br2, three]]});
      input.append(pre);

      const undo = new DomUndo(input);

      two.remove();
      b.remove();
      br2.remove();

      input.appendChild(Dom.h([two, b]));

      three.remove();

      input.appendChild(Dom.h({class: 'pre2', pre: [three]}));

      undo.recordNow();

      assert.equals(htj(input).div, [{class: 'pre1', pre: ['one', {class: 'br1', br: ''}]}, 'two', {
        b: '2',
      }, {class: 'pre2', pre: 'three'}]);

      undo.undo();

      assert.equals(htj(input).div, {
        class: 'pre1',
        pre: ['one', {class: 'br1', br: ''}, 'two', {b: '2'}, {class: 'br2', br: ''}, 'three'],
      });

      undo.redo();

      assert.equals(htj(input).div, [{class: 'pre1', pre: ['one', {class: 'br1', br: ''}]}, 'two', {
        b: '2',
      }, {class: 'pre2', pre: 'three'}]);
    });

    test('combination', () => {
      const ol = Dom.h({ol: [{li: 'hello'}]});
      const li = ol.firstChild;
      const liText = li.firstChild;
      const br1 = Dom.h({br: ''}), br2 = Dom.h({br: ''});
      const text2 = Dom.h('t2');
      const span = Dom.h({span: text2});
      input.appendChild(ol);

      const undo = new DomUndo(input);

      TH.setRange(liText, 2);
      undo.saveCaret();

      input.appendChild(br1);
      liText.textContent = '';
      liText.remove();
      li.appendChild(br2);
      br2.remove();
      ol.remove();
      input.insertBefore(span, br1);
      text2.remove();
      input.insertBefore(text2, span);
      span.remove();

      assert.equals(htj(input).div, ['t2', {br: ''}]);

      undo.undo();

      assert.equals(htj(input).div, {ol: {li: 'hello'}});
      const range = Dom.getRange();
      assert.isTrue(range.collapsed);
      assert.same(range.startContainer, liText);
      assert.same(range.startOffset, 2);

      undo.redo();

      assert.equals(htj(input).div, ['t2', {br: ''}]);
    });

    test('node insert', () => {
      const undo = new DomUndo(input);

      const n = document.createElement('b');
      n.textContent = 'bold';
      input.appendChild(n);

      undo.recordNow();

      assert.equals(undo.undos, [[{node: m.is(n), remove: true}]]);
      assert.equals(undo.redos, []);

      assert.isTrue(undo.undo());

      assert.same(input.firstChild, null);

      assert.equals(undo.redos, [[{node: m.is(n), parent: m.is(input), before: null}]]);
      assert.equals(undo.undos, []);

      assert.isTrue(undo.redo());

      assert.dom(input, () => {
        assert.dom('b', 'bold');
      });
      assert.equals(undo.undos, [[{node: m.is(n), remove: true}]]);
      assert.equals(undo.redos, []);

      const n2 = document.createElement('i');
      input.appendChild(n2);
      n2.textContent = 'italic';

      input.insertBefore(n2, n);

      undo.recordNow();

      undo.undo();

      assert.equals(htj(input).div, {b: 'bold'});

      undo.redo();

      assert.equals(htj(input).div, [{i: 'italic'}, {b: 'bold'}]);

      undo.undo();
      undo.undo();
      assert.equals(htj(input).div, undefined);
      undo.redo();

      assert.equals(htj(input).div, {b: 'bold'});

      undo.redo();

      assert.equals(htj(input).div, [{i: 'italic'}, {b: 'bold'}]);

      undo.undo();

      assert.equals(htj(input).div, {b: 'bold'});

      input.appendChild(Dom.h('text'));

      undo.recordNow();

      undo.redo();

      assert.equals(htj(input).div, [{b: 'bold'}, 'text']);
    });

    test('saveCaret', () => {
      /**
       * Save the caret so that an undo will restore its position. The caret is only saved if there
       * are no pending content modifications and is therefore safe to call anytime.
       */
      const tn = document.createTextNode('hello');
      input.appendChild(tn);
      TH.setRange(tn, 2);

      const undo = new DomUndo(input);

      tn.textContent = 'hello 2';
      undo.saveCaret();
      const br = Dom.h({br: 2});
      input.appendChild(br);
      TH.setRange(tn, 4);
      undo.saveCaret();

      undo.recordNow();
      const ans0 = [{node: m.is(tn), text: 'hello'}, {node: m.is(br), remove: true}];
      assert.equals(undo.undos, [ans0]);
      assert.equals(undo.undos[0][range$], [m.is(tn), 2]);
      TH.setRange(tn, 1);
      undo.saveCaret();

      TH.setRange(tn, 5);
      undo.saveCaret();

      tn.textContent = 'moved at 5';
      undo.recordNow();
      assert.equals(undo.undos[0], ans0);

      assert.equals(undo.undos[1], [{node: m.is(tn), text: 'hello 2'}]);
      assert.equals(undo.undos[1][range$], [m.is(tn), 5]);
    });
  });
});
