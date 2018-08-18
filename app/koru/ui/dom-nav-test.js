isClient && define((require, exports, module)=>{
  const Dom             = require('koru/dom');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd, util} = TH;

  const sut = require('./dom-nav');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    let inputElm;

    const collapse = start =>{
      const range = Dom.getRange();
      range.collapse(start);
      Dom.setRange(range);
      return range;
    };

    beforeEach(()=>{
      document.body.appendChild(inputElm = Dom.h({contenteditable: 'true', div: []}));
    });

    afterEach(()=>{
      TH.domTearDown();
    });

    test("clearEmptyText", ()=>{
      inputElm.appendChild(Dom.h(["text", "", "", "stop", "", {br: ''}, ""]));
      sut.clearEmptyText(inputElm.childNodes[1]);
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', "stop", '', {br: ''}, '']);
      sut.clearEmptyText(inputElm.childNodes[2]);
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', "stop", {br: ''}, '']);
      sut.clearEmptyText(inputElm.childNodes[3]);
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', "stop", {br: ''}]);
    });

    test("clearTrailingBR", ()=>{
      const div = Dom.h({});
      div.appendChild(sut.clearTrailingBR(Dom.h(['one', {br: ''}, {br: ''}, '', ''])));
      assert.equals(Dom.htmlToJson(div).div, ['one', {br: ''}]);
      sut.clearTrailingBR(div);
      assert.equals(Dom.htmlToJson(div).div, 'one');

      sut.clearTrailingBR(div);
      assert.equals(Dom.htmlToJson(div).div, 'one');
    });

    test("newLine", ()=>{
      inputElm.appendChild(Dom.h(["text", "", ""]));
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', "", ""]);
      TH.setRange(inputElm, 1);
      sut.newLine();
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', {br: ''}, {br: ''}]);
    });

    group("normRange", ()=>{
      let childNodes, range;
      before(()=>{
        inputElm.appendChild(Dom.h([
          "one ",
          {span: [{b: ["b1 ", "b2"]}, {button: []}, "after button"]},
          "three",
          {i: "four"},
          {pre: {br: ''}},
          {br: ''},
          "end",
        ]));
        childNodes = inputElm.childNodes;
        range = document.createRange();
      });

      afterEach(()=>{
        range.setEnd(document, 0);
      });

      test("nested text", ()=>{
        range.setStart(inputElm, 1);
        sut.normRange(range);
        assert.same(range.startContainer.nodeValue, 'b1 ');
        assert.equals(range.startOffset, 0);
      });

      test("empty node", ()=>{
        const span = Dom('span');
        range.setStart(span, 1);
        sut.normRange(range);
        assert.same(range.startContainer, span);
        assert.equals(range.startOffset, 1);
      });

      test("empty followed by node", ()=>{
        const pre = Dom('pre');
        range.setStart(pre.firstChild, 0);
        sut.normRange(range);
        assert.same(range.startContainer, pre);
        assert.equals(range.startOffset, 0);
      });

      test("end of text node", ()=>{
        const b = Dom('b');
        range.setStart(b.firstChild, 3);
        sut.normRange(range);
        assert.same(range.startContainer.nodeValue, 'b2');
        assert.equals(range.startOffset, 0);

        range.setStart(childNodes[2], "three".length);
        sut.normRange(range);
        assert.same(range.startContainer.nodeValue, 'three');
        assert.equals(range.startOffset, "three".length);
      });
    });

    test("getTag", ()=>{
      inputElm.appendChild(Dom.h([
        {div: {ol: {li: 'one'}}},
        {div: {ul: {li: 'two'}}},
      ]));

      assert.dom(inputElm, ()=>{
        assert.dom('li', 'two', li =>{
          TH.setRange(li.firstChild, 1);
          const ul = sut.getTag('ul', inputElm);
          assert.same(ul && ul.tagName, 'UL');
          TH.setRange(ul, 0);
          const div = sut.getTag(e => e.parentNode === inputElm);
          assert.same(div, inputElm.lastChild);
          assert.same(sut.getTag(e => false), null);
          assert.same(sut.getTag(e => e === document.body, document.body.parentNode), document.body);
          assert.same(sut.getTag(e => e === document.body, inputElm), null);
        });
      });
    });

    group("insertNode", ()=>{
      test("replace text", ()=>{
        inputElm.appendChild(Dom.h(["one ", "two ", "three"]));
        TH.setRange(inputElm.childNodes[1]);
        sut.insertNode(Dom.h({b: '2 '}));

        assert.equals(Dom.htmlToJson(inputElm).div, ['one ', '', {b: '2 '}, '', 'three']);

        const range = Dom.getRange();
        assert.same(range.startContainer, inputElm.childNodes[3]);
        assert.same(range.startOffset, 0);

        assert.isTrue(range.collapsed);
      });

    });

    test("startOfLine", ()=>{
      const line2 = Dom.h({div: ['text', {b: 'bold'}, 'more text']});
      const br = document.createElement('br'), br2 = document.createElement('br');
      inputElm.appendChild(Dom.h([{div: "hello world"}, line2, br, 'before ', {i: ['a']}, ' break', br2]));
      assert.dom(inputElm, input =>{
        TH.setRange(input.lastChild, 0);
        let range = sut.startOfLine();
        assert.same(range.startContainer, br2.parentNode);
        assert.same(range.startOffset, 7);

        TH.setRange(br2.previousSibling, 3);
        range = sut.startOfLine();
        assert.same(range.startContainer, br.nextSibling);
        assert.same(range.startOffset, 0);

        TH.setRange(line2.lastChild, 6);
        range = sut.startOfLine();
        assert.same(range.startContainer, line2.firstChild);
        assert.same(range.startOffset, 0);
      });
    }),

    test("startOfNextLine", ()=>{
      inputElm.innerHTML = 'abc<br>def';
      let range;

      TH.setRange(inputElm.firstChild, 1);

      range = sut.startOfNextLine();
      assert.same(range.startContainer.nodeValue, "def");
      assert.same(range.startOffset, 0);
    });

    test("endOfLine", ()=>{
      const line2 = Dom.h({div: ['text', {b: 'bold'}, 'more text']});
      const br = document.createElement('br'), br2 = document.createElement('br');
      inputElm.appendChild(Dom.h([{div: "hello world"}, line2, br, 'before ', {i: ['a']}, ' break', br2]));
      assert.dom(inputElm, input =>{
        let range;

        TH.setRange(line2.lastChild, 6);
        range = sut.endOfLine();
        assert.same(range.startContainer.nodeValue, "more text");
        assert.same(range.startOffset, 9);

        TH.setRange(input.firstChild, 0);
        range = sut.endOfLine();
        assert.same(range.startContainer.nodeValue, "hello world");
        assert.same(range.startOffset, 11);

        TH.setRange(br.nextSibling, 3);
        range = sut.endOfLine();
        assert.same(range.startContainer, br2.parentNode);
        assert.same(range.startOffset, Dom.nodeIndex(br2));

        TH.setRange(line2.firstChild, 0);
        range = sut.endOfLine();
        assert.same(range.startContainer, line2.lastChild);
        assert.same(range.startOffset, 9);
      });
    });

    test("selectLine", ()=>{
      const divLine = Dom.h({div: "hello world"});
      const line2 = Dom.h({div: ['text', {b: 'bold'}, 'more text']});
      const br = document.createElement('br'), br2 = document.createElement('br');
      inputElm.appendChild(Dom.h([divLine, line2, br, 'before ', {i: ['a']}, ' break', br2]));
      assert.dom(inputElm, input =>{
        let range;
        TH.setRange(divLine.firstChild, 5);
        range = sut.selectLine();
        assert.isFalse(range.collapsed);
        assert.same(range.startContainer.nodeValue, "hello world");
        assert.same(range.startOffset, 0);
        assert.same(range.endContainer, line2.firstChild);
        assert.same(range.endOffset, 0);

        TH.setRange(line2.lastChild, 6);
        range = sut.selectLine();
        assert.same(range.endContainer, br.nextSibling);
        assert.same(range.endOffset, 0);
        assert.same(range.startContainer, line2.firstChild);
        assert.same(range.startOffset, 0);
        assert.isFalse(range.collapsed);

        TH.setRange(br2.previousSibling, 3);
        range = sut.selectLine();
        assert.isFalse(range.collapsed);
        assert.same(range.startContainer, br.nextSibling);
        assert.same(range.startOffset, 0);
        assert.same(range.endContainer, br2.parentNode);
        assert.same(range.endOffset, Dom.nodeIndex(br2)+1);
      });
    });

    group("selectRange", ()=>{
      test("within text node ", ()=>{
        inputElm.appendChild(Dom.h({div: "hello world"}));
        TH.setRange(sut.firstInnerMostNode(inputElm),5);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 5, sut.firstInnerMostNode(inputElm), 6);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 5, sut.firstInnerMostNode(inputElm), 6);
      });

      test("next line", ()=>{
        inputElm.innerHTML = '<div><div>hello</div><div>world</div></div>';
        TH.setRange(sut.firstInnerMostNode(inputElm),5);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.firstChild.lastChild), 0);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.firstChild.lastChild), 0);
      });

      test("block nested", ()=>{
        inputElm.innerHTML =
          "<div><div>hello world <b>in <i>here</i></b></div></div><div>line 2</div>";
        const iElm = inputElm.querySelector('i').firstChild;
        TH.setRange(iElm, 4);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(iElm, 4, inputElm.childNodes[1].firstChild, 0);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(iElm, 4, inputElm.childNodes[1].firstChild, 0);
      });

      test("span nested", ()=>{
        inputElm.innerHTML =
          "<div><div>hello <b>in <i>here</i> out</b></div></div><div>line 2</div>";
        TH.setRange(sut.firstInnerMostNode(inputElm), 6);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 6,
                           sut.firstInnerMostNode(inputElm.querySelector('b')), 1);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', 7));
        assert.rangeEquals(sut.firstInnerMostNode(
          inputElm.querySelector('b')), 1, sut.lastInnerMostNode(inputElm.querySelector('b')), 1);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -7));
        assert.rangeEquals(sut.firstInnerMostNode(
          inputElm.querySelector('b')), 1, sut.lastInnerMostNode(inputElm.querySelector('b')), 1);

        collapse(true);
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(sut.firstInnerMostNode(
          inputElm.querySelector('b')), 0, sut.firstInnerMostNode(inputElm.querySelector('b')), 1);

        collapse(true);
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.querySelector('b')), 0);
      });
    });
  });
});
