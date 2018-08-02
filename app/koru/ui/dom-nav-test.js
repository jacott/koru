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
