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
      inputElm.focus();
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

    test("newline", ()=>{
      inputElm.appendChild(Dom.h(["text", "", ""]));
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', "", ""]);
      TH.setRange(inputElm, 1);
      sut.newline();
      assert.equals(Dom.htmlToJson(inputElm).div, ['text', {br: ''}, {br: ''}]);
    });

    group("range", ()=>{
      let range;
      before(()=>{
        inputElm.appendChild(Dom.h([
          "one ",
          {id: 'br0', br: ''},
          {id: 'br0e', br: ''},
          {span: [{b: ["b1 ", "b2"]}, {button: []}, "after button"]},
          "three",
          {id: 'br1', br: ''},
          {i: "four"},
          {pre: {id: 'br2', br: ''}},
          {id: 'br3', br: ''},
          "end",
        ]));
        range = document.createRange();
      });

      afterEach(()=>{
        range.setEnd(document, 0);
      });

      group("rangeisInline", ()=>{
        test("on single text node", ()=>{
          const n = inputElm.lastChild;

          range.setStart(n, n.nodeValue.length);
          assert.isTrue(sut.rangeIsInline(range));
        });

        test("within an inline element", ()=>{
          const span = Dom('span');
          range.setStart(span.querySelector('b').lastChild, 1);
          range.setEnd(span.lastChild, 4);

          assert.isTrue(sut.rangeIsInline(range));
        });

        test("full line", ()=>{
          const span = Dom('span');
          range.setStart(span, 0);
          range.setEnd(span.nextSibling, 'three'.length);
          sut.normRange(range);
          assert.isFalse(sut.rangeIsInline(range));
        });

        test("between br nodes", ()=>{
          const span = Dom('span');
          range.setStart(span, 0);
          range.setEnd(span.nextSibling, 3);
          sut.normRange(range);
          assert.isTrue(sut.rangeIsInline(range));
        });

        test("on empty line", ()=>{
          const br0 = Dom('#br0e');
          range.setStart(br0, 0);
          range.collapse(true);
          assert.isFalse(sut.rangeIsInline(range));
        });
      });

      group("containingNode", ()=>{
        test("in br", ()=>{
          const br1 = Dom('#br1');
          range.setStart(br1, 0);
          assert.same(sut.containingNode(range), br1);

          range.setStart(br1.parentNode, Dom.nodeIndex(br1));
          range.collapse(true);
          assert.same(sut.containingNode(range), br1);
        });

        test("in text", ()=>{
          const b = Dom('span>b');
          range.setStart(b.lastChild, 1);
          assert.same(sut.containingNode(range), b);
        });

        test("selection nodes", ()=>{
          const span = Dom('span');
          const b = span.querySelector('span>b');
          range.setStart(b.lastChild, 1);
          range.setEnd(span.querySelector('button'), 0);
          assert.isFalse(range.collapsed);
          assert.same(sut.containingNode(range), span);
        });

        test("selection common text", ()=>{
          const b = Dom('span>b');
          range.setStart(b.firstChild, 1);
          range.setEnd(b.lastChild, 1);
          assert.isFalse(range.collapsed);
          assert.same(sut.containingNode(range), b);
        });
      });

      group("normRange", ()=>{
        test("empty Div", ()=>{
          const div = Dom.h({});
          inputElm.appendChild(div);
          onEnd(()=>{div.remove()});

          range.setStart(div, 0);
          sut.normRange(range);
          assert.rangeEquals(range, div, 0);
        });

        test("in br", ()=>{
          const br1 = Dom('#br1');
          range.setStart(br1, 0);
          sut.normRange(range);
          assert.rangeEquals(range, br1.parentNode, Dom.nodeIndex(br1));
        });

        test("nested text", ()=>{
          range.setStart(inputElm, Dom.nodeIndex(Dom('span')));
          sut.normRange(range);
          assert.rangeEquals(range, Dom('span>b').firstChild, 0);
        });

        test("empty node", ()=>{
          const span = Dom('span'), button = span.querySelector('button');

          range.setStart(span, 1);
          sut.normRange(range);
          assert.rangeEquals(range, button, 0);
        });

        test("empty followed by node", ()=>{
          const pre = Dom('pre');
          range.setStart(pre.firstChild, 0);
          sut.normRange(range);
          assert.rangeEquals(range, pre, 0);
        });

        test("end of text node", ()=>{
          const b = Dom('b');
          range.setStart(b.firstChild, 3);
          sut.normRange(range);
          assert.rangeEquals(range, b.lastChild, 0);

          const three = Dom('span').nextSibling;

          range.setStart(three, "three".length);
          sut.normRange(range);
          assert.rangeEquals(range, three, "three".length);
        });
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

    group("selecting", ()=>{
      const divLine = Dom.h({id: 'divLine', div: ["hello world"]});
      const ebr1 = Dom.h ({id: 'ebr1', br: ''}), ebr2 = Dom.h({id: 'ebr2', br: ''});
      const emptyLine = Dom.h({id: 'emptyLine', div: ["be", ebr1, ebr2, 'ae']});
      const line2 = Dom.h({id: 'line2', div: ['text', {b: 'bold'}, 'more text']});
      const br = Dom.h({id: 'br', br: ''}), br2 = Dom.h({id: 'br2', br: ''}),
            br3 = Dom.h({id: 'br3', br: ''});

      before(()=>{
        inputElm.appendChild(Dom.h([
          divLine,
          line2,
          br,
          'before ', {i: ['a']}, ' break', br2,
          br3,
          emptyLine]));
      });

      group("empty nested line line", ()=>{
        beforeEach(()=>{
          TH.setRange(emptyLine, 2);
        });

        test("normRange", ()=>{
          const range = document.createRange();
          range.setStart(ebr2, 0);

          sut.normRange(range);

          assert.same(range.startOffset, 2);
          assert.same(range.startContainer, emptyLine);
        });

        test("startOfLine", ()=>{
          let range = sut.startOfLine();
          assert.same(range.startContainer, emptyLine);
          assert.same(range.startOffset, 2);

          range.setStart(ebr2, 0);
          range = sut.startOfLine();
          assert.same(range.startContainer, emptyLine);
          assert.same(range.startOffset, 2);
        });

        test("startOfNextLine", ()=>{
          let range = sut.startOfNextLine();
          assert.same(range.startContainer.nodeValue, 'ae');
          assert.same(range.startOffset, 0);

          range.setStart(ebr2, 0);
          range = sut.startOfNextLine();
          assert.same(range.startContainer.nodeValue, 'ae');
          assert.same(range.startOffset, 0);
        });

        test("endOfLine", ()=>{
          let range = sut.endOfLine();
          assert.same(range.startContainer, emptyLine);
          assert.same(range.startOffset, 2);

          range.setStart(ebr2, 0);
          range = sut.endOfLine();
          assert.same(range.startContainer, emptyLine);
          assert.same(range.startOffset, 2);
        });

        test("selectLine", ()=>{
          const range = sut.selectLine();
          assert.same(range.startContainer, emptyLine);
          assert.same(range.startOffset, 2);

          assert.same(range.endContainer.nodeValue, 'ae');
          assert.same(range.endOffset, 0);
       });
      });

      group("startOfLine", ()=>{
        test("end of unwrapped line", ()=>{
          TH.setRange(br2, 0);
          const range = sut.startOfLine();
          assert.same(range.startContainer.nodeValue, 'before ');
          assert.same(range.startOffset, 0);
        });

        test("middle of unwrapped line", ()=>{
          TH.setRange(br2.previousSibling, 3);
          const range = sut.startOfLine();
          assert.same(range.startContainer.nodeValue, 'before ');
          assert.same(range.startOffset, 0);
        });

        test("middle of complex line", ()=>{
          TH.setRange(line2.lastChild, 6);
          const range = sut.startOfLine();
          assert.same(range.startContainer, line2.firstChild);
          assert.same(range.startOffset, 0);
        });
      }),

      group("startOfNextLine", ()=>{
        test("start of complex line", ()=>{
          TH.setRange(line2.firstChild, 0);
          const range = sut.startOfNextLine();
          assert.same(range.startContainer, br.parentNode);
          assert.same(range.startOffset, Dom.nodeIndex(br));
        });

        test("end complex line", ()=>{
          TH.setRange(line2.lastChild, 6);
          const range = sut.startOfNextLine();
          assert.same(range.startContainer, br.parentNode);
          assert.same(range.startOffset, Dom.nodeIndex(br));
        });

        test("text only line", ()=>{
          TH.setRange(inputElm.firstChild, 0);
          const range = sut.startOfNextLine();
          assert.same(range.startContainer.nodeValue, "text");
          assert.same(range.startOffset, 0);
        });

        test("on unwrapped line", ()=>{
          TH.setRange(br.nextSibling, 3);
          const range = sut.startOfNextLine();
          assert.same(range.startContainer, br3.parentNode);
          assert.same(range.startOffset, Dom.nodeIndex(br3));
        });
      });

      group("endOfLine", ()=>{
        test("start of complex line", ()=>{
          TH.setRange(line2.firstChild, 0);
          const range = sut.endOfLine();
          assert.same(range.startContainer, line2.lastChild);
          assert.same(range.startOffset, 9);
        });

        test("end complex line", ()=>{
          TH.setRange(line2.lastChild, 6);
          const range = sut.endOfLine();
          assert.same(range.startContainer.nodeValue, "more text");
          assert.same(range.startOffset, 9);
        });

        test("text only line", ()=>{
          TH.setRange(inputElm.firstChild, 0);
          const range = sut.endOfLine();
          assert.same(range.startContainer.nodeValue, "hello world");
          assert.same(range.startOffset, 11);
        });

        test("before complex line", ()=>{
          TH.setRange(br.nextSibling, 3);
          const range = sut.endOfLine();
          assert.same(range.startContainer, br2.parentNode);
          assert.same(range.startOffset, Dom.nodeIndex(br2));
        });

        test("before empty line", ()=>{
          TH.setRange(br2.previousSibling, 3);
          const range = sut.endOfLine();
          assert.same(range.endContainer, br2.parentNode);
          assert.same(range.endOffset, Dom.nodeIndex(br2));
        });
      });

      group("selectLine", ()=>{
        test("text line", ()=>{
          TH.setRange(divLine.firstChild, 5);
          const range = sut.selectLine();
          assert.isFalse(range.collapsed);
          assert.same(range.startContainer.nodeValue, "hello world");
          assert.same(range.startOffset, 0);
          assert.same(range.endContainer, line2.firstChild);
          assert.same(range.endOffset, 0);
        });

        test("complex line", ()=>{
          TH.setRange(line2.lastChild, 6);
          const range = sut.selectLine();
          assert.same(range.endContainer, br.parentNode);
          assert.same(range.endOffset, Dom.nodeIndex(br));
          assert.same(range.startContainer, line2.firstChild);
          assert.same(range.startOffset, 0);
          assert.isFalse(range.collapsed);
        });

        test("before empty line", ()=>{
          TH.setRange(br2.previousSibling, 3);
          const range = sut.selectLine();
          assert.isFalse(range.collapsed);
          assert.same(range.startContainer, br.nextSibling);
          assert.same(range.startOffset, 0);
          assert.same(range.endContainer, br2.parentNode);
          assert.same(range.endOffset, Dom.nodeIndex(br2)+1);
        });
      });
    });

    group("selectRange", ()=>{
      test("within text node ", ()=>{
        inputElm.appendChild(Dom.h({div: "hello world"}));
        TH.setRange(sut.firstInnerMostNode(inputElm),5);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 5, 6);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 5, 6);
      });

      test("next line", ()=>{
        inputElm.innerHTML = '<div><div>hello</div><div>world</div></div>';
        TH.setRange(sut.firstInnerMostNode(inputElm),5);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.firstChild.lastChild), 0);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.firstChild.lastChild), 0);
      });

      test("block nested", ()=>{
        inputElm.innerHTML =
          "<div><div>hello world <b>in <i>here</i></b></div></div><div>line 2</div>";
        const iElm = inputElm.querySelector('i').firstChild;
        TH.setRange(iElm, 4);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(undefined, iElm, 4, inputElm.childNodes[1].firstChild, 0);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(undefined, iElm, 4, inputElm.childNodes[1].firstChild, 0);
      });

      test("span nested", ()=>{
        inputElm.innerHTML =
          "<div><div>hello <b>in <i>here</i> out</b></div></div><div>line 2</div>";
        TH.setRange(sut.firstInnerMostNode(inputElm), 6);

        Dom.setRange(sut.selectRange(inputElm, 'char', 1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 6,
                           sut.firstInnerMostNode(inputElm.querySelector('b')), 1);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', 7));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(
          inputElm.querySelector('b')), 1, sut.lastInnerMostNode(inputElm.querySelector('b')), 1);

        collapse();
        Dom.setRange(sut.selectRange(inputElm, 'char', -7));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(
          inputElm.querySelector('b')), 1, sut.lastInnerMostNode(inputElm.querySelector('b')), 1);

        collapse(true);
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(
          inputElm.querySelector('b')), 0, sut.firstInnerMostNode(inputElm.querySelector('b')), 1);

        collapse(true);
        Dom.setRange(sut.selectRange(inputElm, 'char', -1));
        assert.rangeEquals(undefined, sut.firstInnerMostNode(inputElm), 5,
                           sut.firstInnerMostNode(inputElm.querySelector('b')), 0);
      });
    });
  });
});
