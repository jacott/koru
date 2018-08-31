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

    test("clearEmptyInline", ()=>{
      const div = Dom.h({div: [
        {span: ["", "", {span: ["", ""]}]}, "",
        {span: {b: {i: ''}}}, "stop", "", {br: ''},
        {b: ["", "", {i: ["", ""]}]}, "",
      ]});
      sut.clearEmptyInline(div);
      assert.equals(Dom.htmlToJson(div).div, ["stop", '', {br: ''}]);

      const div2 = Dom.h({div: [{br: ''}, 'two', {br: ''}]});
      sut.clearEmptyInline(div2);
      assert.equals(Dom.htmlToJson(div2).div, [{br: ''}, 'two', {br: ''}]);
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

    group("positioning", ()=>{
      const spanStartBr = Dom.h({span: [{br: ''}, 'end']}),
            spanEndBr = Dom.h({span: ['start', {br: ''}]}),
            midText = Dom.h('mid text');
      const divTextOnly = Dom.h({id: 'divLine', div: ["hello world"]});
      const divWithB = Dom.h({id: 'line2', div: ['text', {b: 'bold'}, 'more text']});
      const br = Dom.h({id: 'br', br: ''}), br2 = Dom.h({id: 'br2', br: ''}),
            br3 = Dom.h({id: 'br3', br: ''});
      const ebr1 = Dom.h ({id: 'ebr1', br: ''}), ebr2 = Dom.h({id: 'ebr2', br: ''});
      const emptyLine = Dom.h({id: 'emptyLine', div: ["be", ebr1, ebr2, 'ae']});
      const spanWithBr = Dom.h({span: ['span start', {br: ''}, 'span end']});

      const spanBeginsWithBr = ()=>{
        inputElm.appendChild(Dom.h([
          br2,
          midText,
          spanStartBr,
        ]));
      };

      const spanEndsWithBr = ()=>{
        inputElm.appendChild(Dom.h([
          spanEndBr,
          midText,
          br2,
        ]));
      };

      const complexLines = ()=>{
        inputElm.appendChild(Dom.h([
          divTextOnly,
          divWithB,
          br,
          'before ', {i: ['a']}, ' break', br2,
          br3,
          emptyLine,
          spanWithBr, ' end',
        ]));
      };

      group("restrictRange", ()=>{
        before(()=>{complexLines()});

        test("completely within", ()=>{
          TH.setRange(divWithB, 1, divWithB.lastChild, 3);
          assert.rangeEquals(
            sut.restrictRange(Dom.getRange(), inputElm),
            divWithB, 1, divWithB.lastChild, 3);
        });

        test("within", ()=>{
          TH.setRange(divWithB, 1, divWithB.lastChild, 3);
          assert.rangeEquals(
            sut.restrictRange(Dom.getRange(), divWithB),
            divWithB, 1, divWithB.lastChild, 3);
        });

        test("both outside", ()=>{
          TH.setRange(divTextOnly, 0, br3, 0);
          assert.rangeEquals(
            sut.restrictRange(Dom.getRange(), divWithB),
            divWithB, 0, divWithB, divWithB.childNodes.length
          );

        });
      });

      test("previousNode", ()=>{
        complexLines();

        assert.same(sut.previousNode(divWithB.firstChild, divWithB), null);

        assert.same(sut.previousNode(inputElm.firstChild, inputElm), null);

        assert.same(sut.previousNode(divWithB.querySelector('b').firstChild, divWithB),
                    divWithB.firstChild);

        let node = inputElm.lastChild;

        assert.same((node = sut.previousNode(node)).nodeValue, 'span end');
        assert.same(node = sut.previousNode(node), spanWithBr.childNodes[1]);
        assert.same(node = sut.previousNode(node), spanWithBr.firstChild);
        assert.same((node = sut.previousNode(node)).nodeValue, 'ae');
        assert.same(node = sut.previousNode(node), ebr2);
        assert.same(node = sut.previousNode(node), ebr1);
        assert.same((node = sut.previousNode(node)).nodeValue, 'be');
        assert.same(node = sut.previousNode(node), br3);
        assert.same(node = sut.previousNode(node), br2);
        assert.same((node = sut.previousNode(node)).nodeValue, ' break');
        assert.same((node = sut.previousNode(node)).nodeValue, 'a');
        assert.same(node = sut.previousNode(node), br.nextSibling);
        assert.same(node = sut.previousNode(node), br);
      });

      test("nextNode", ()=>{
        complexLines();

        assert.same(sut.nextNode(divWithB.lastChild, divWithB), null);

        assert.same(sut.nextNode(inputElm.lastChild), null);

        assert.same(sut.nextNode(divWithB.querySelector('b').firstChild, divWithB),
                    divWithB.lastChild);

        let node = divTextOnly.firstChild;

        assert.same(node = sut.nextNode(node), divWithB.firstChild);
        assert.same((node = sut.nextNode(node)).nodeValue, 'bold');
        assert.same(node = sut.nextNode(node), divWithB.lastChild);
        assert.same(node = sut.nextNode(node), br);
        assert.same(node = sut.nextNode(node), br.nextSibling);
        assert.same((node = sut.nextNode(node)).nodeValue, 'a');
        assert.same((node = sut.nextNode(node)).nodeValue, ' break');
        assert.same(node = sut.nextNode(node), br2);
        assert.same(node = sut.nextNode(node), br3);
        assert.same((node = sut.nextNode(node)).nodeValue, 'be');
        assert.same(node = sut.nextNode(node), ebr1);
        assert.same(node = sut.nextNode(node), ebr2);
        assert.same((node = sut.nextNode(node)).nodeValue, 'ae');
      });

      test("rangeStartNode", ()=>{
        complexLines();

        const range = document.createRange();

        range.setStart(inputElm, 0);
        assert.same(sut.rangeStartNode(range), inputElm.firstChild);

        range.setStart(inputElm, inputElm.childNodes.length);
        assert.same(sut.rangeStartNode(range), null);

        range.setStart(divWithB, divWithB.childNodes.length);
        assert.same(sut.rangeStartNode(range, inputElm), br);
        assert.same(sut.rangeStartNode(range, divWithB), null);

        range.setStart(ebr1, 0);
        assert.same(sut.rangeStartNode(range), ebr1);
      });

      group("", ()=>{

      });

      group("selectLine", ()=>{
        before(()=>{
          complexLines();
        });

        test("end complex line", ()=>{
          TH.setRange(divWithB.lastChild, 6);
          assert.rangeEquals(sut.selectLine(),
                             divWithB.firstChild, 0,
                             br, 0);
        });

        test("divTextOnly", ()=>{
          TH.setRange(divWithB.firstChild, 4);
          assert.rangeEquals(sut.selectLine(), divWithB.firstChild, 0, br, 0);
        });
      });

      group("startOfNextLine", ()=>{
         test("spanBeginsWithBr", ()=>{
           spanBeginsWithBr();

           TH.setRange(midText, 4);
           assert.rangeEquals(sut.startOfNextLine(), spanStartBr.lastChild, 0);

           TH.setRange(spanStartBr.lastChild, 0);
           assert.rangeEquals(sut.startOfNextLine(), inputElm, inputElm.childNodes.length);
         });

        test("spanEndsWithBr", ()=>{
          spanEndsWithBr();

          TH.setRange(midText, 4);
          assert.rangeEquals(sut.startOfNextLine(), inputElm, inputElm.childNodes.length);
        });

        group("complexLines", ()=>{
          before(()=>{
            complexLines();
          });

          test("empty nested line line", ()=>{
            TH.setRange(emptyLine, 2);
            assert.rangeEquals(sut.startOfNextLine(), emptyLine.lastChild, 0);

            TH.setRange(ebr2, 0);
            assert.rangeEquals(sut.startOfNextLine(), emptyLine.lastChild, 0);
          });

          test("start of complex line", ()=>{
            TH.setRange(divWithB.firstChild, 0);
            assert.rangeEquals(sut.startOfNextLine(), br, 0);
          });

          test("end complex line", ()=>{
            TH.setRange(divWithB.lastChild, 6);
            assert.rangeEquals(sut.startOfNextLine(), br, 0);
          });

          test("text only line", ()=>{
            TH.setRange(inputElm.firstChild, 0);
            assert.rangeEquals(sut.startOfNextLine(), divWithB.firstChild, 0);
          });

          test("before complex line", ()=>{
            TH.setRange(br.nextSibling, 3);
            assert.rangeEquals(sut.startOfNextLine(), br3, 0);
          });

          test("before empty line", ()=>{
            TH.setRange(br2.previousSibling, 3);
            assert.rangeEquals(sut.startOfNextLine(), br3, 0);
          });

          test("end of spanWithBr", ()=>{
            TH.setRange(spanWithBr.firstChild, 4);
            assert.rangeEquals(sut.startOfNextLine(), spanWithBr.lastChild, 0);
          });

          test("on br of spanWithBr", ()=>{
            TH.setRange(spanWithBr.querySelector('br'), 0);
            assert.rangeEquals(sut.startOfNextLine(), spanWithBr.lastChild, 0);
          });

          test("last line", ()=>{
            TH.setRange(spanWithBr.lastChild, 0);
            assert.rangeEquals(sut.startOfNextLine(),
                               inputElm, inputElm.childNodes.length);
          });
        });
      });

      group("endOfLine", ()=>{
         test("spanBeginsWithBr", ()=>{
           spanBeginsWithBr();

           TH.setRange(midText, 4);
           assert.rangeEquals(sut.endOfLine(), spanStartBr, 0);
         });

        test("spanEndsWithBr", ()=>{
          spanEndsWithBr();

          TH.setRange(midText, 4);
          assert.rangeEquals(sut.endOfLine(), midText, midText.nodeValue.length);
        });

        group("complexLines", ()=>{
          before(()=>{
            complexLines();
          });

          test("empty nested line line", ()=>{
            TH.setRange(emptyLine, 2);
            assert.rangeEquals(sut.endOfLine(), emptyLine, 2);

            TH.setRange(ebr2, 0);
            assert.rangeEquals(sut.endOfLine(), emptyLine, 2);
          });

          test("start of complex line", ()=>{
            TH.setRange(divWithB.firstChild, 0);
            const range = sut.endOfLine();
            assert.same(range.startContainer, divWithB.lastChild);
            assert.same(range.startOffset, 9);
          });

          test("end complex line", ()=>{
            TH.setRange(divWithB.lastChild, 6);
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
            assert.rangeEquals(sut.endOfLine(), br2.previousSibling, 6);
          });

          test("before empty line", ()=>{
            TH.setRange(br2.previousSibling, 3);
            assert.rangeEquals(sut.endOfLine(), br2.previousSibling, 6);
          });

          test("end of spanWithBr", ()=>{
            const node = spanWithBr.firstChild;
            TH.setRange(node, 4);
            assert.rangeEquals(sut.endOfLine(), node, node.nodeValue.length);
          });

          test("on br of spanWithBr", ()=>{
            TH.setRange(spanWithBr.querySelector('br'), 0);
            assert.rangeEquals(sut.endOfLine(), spanWithBr, 1);
          });

          test("last line", ()=>{
            TH.setRange(spanWithBr.lastChild, 0);
            assert.rangeEquals(sut.endOfLine(),
                               inputElm.lastChild, inputElm.lastChild.nodeValue.length);
          });
        });
      });

      group("startOfLine", ()=>{
        test("spanBeginsWithBr", ()=>{
          spanBeginsWithBr();

          TH.setRange(midText, 4);
          assert.rangeEquals(sut.startOfLine(), midText, 0);

          TH.setRange(spanStartBr, 0);
          assert.rangeEquals(sut.startOfLine(), midText, 0);

          TH.setRange(spanStartBr.lastChild, 2);
          assert.rangeEquals(sut.startOfLine(), spanStartBr.lastChild, 0);
        });

        test("spanEndsWithBr", ()=>{
          spanEndsWithBr();

          TH.setRange(midText, 4);
          assert.rangeEquals(sut.startOfLine(), midText, 0);
        });

        group("complexLines", ()=>{
          before(()=>{
            complexLines();
          });

          test("empty nested line line", ()=>{
            TH.setRange(emptyLine, 2);
            assert.rangeEquals(sut.startOfLine(), emptyLine, 2);

            TH.setRange(ebr2, 0);
            assert.rangeEquals(sut.startOfLine(), emptyLine, 2);
          });

          test("end of unwrapped line", ()=>{
            TH.setRange(br2, 0);
            assert.rangeEquals(
              sut.startOfLine(),
              br.nextSibling, 0);
          });

          test("middle of unwrapped line", ()=>{
            TH.setRange(br2.previousSibling, 3);
            const range = sut.startOfLine();
            assert.same(range.startContainer.nodeValue, 'before ');
            assert.same(range.startOffset, 0);
          });

          test("middle of complex line", ()=>{
            TH.setRange(divWithB.lastChild, 6);
            const range = sut.startOfLine();
            assert.same(range.startContainer, divWithB.firstChild);
            assert.same(range.startOffset, 0);
          });

          test("end of spanWithBr", ()=>{
            TH.setRange(spanWithBr.lastChild, 4);
            assert.rangeEquals(sut.startOfLine(), spanWithBr.lastChild, 0);
          });

          test("on br of spanWithBr", ()=>{
            TH.setRange(spanWithBr.querySelector('br'), 0);
            assert.rangeEquals(sut.startOfLine(), spanWithBr.firstChild, 0);
          });
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
