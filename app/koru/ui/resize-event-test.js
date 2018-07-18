isClient && define((require, exports, module)=>{
  const Dom = require('koru/dom');
  const TH  = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./resize-event');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.raf = stub(window, 'requestAnimationFrame').returns(123);
      v.html = Dom.h({div: 'foo', $style: "width:100px;height:150px"});
      document.body.appendChild(v.html);
      v.resizer = sut.onWidthResize(v.html, v.resized = stub());
    });

    afterEach(()=>{
      Dom.remove(v.html);
      v = {};
    });

    test("detach", ()=>{
      stub(window, 'cancelAnimationFrame');

      assert.dom('div', elm =>{
        assert.same(elm.childNodes.length, 2);

        v.resizer.detach();

        assert.calledWith(window.cancelAnimationFrame, 123);

        assert.same(elm.childNodes.length, 1);
      });
    });

    test("resize width", ()=>{
      assert.calledWith(v.raf, TH.match.func);
      v.raf.yield();
      v.raf.reset();
      refute.called(v.resized);

      assert.dom('iframe', function () {
        v.html.style.width = '110px';
        assert.equals(
          this.style.cssText.replace(/medium none/, 'none')
            . replace(/\s+/g, '').split(';').sort().join(';'),
          ';border:none;height:100%;left:0px;margin:1px0px0px;opacity:0;'+
            'pointer-events:none;position:absolute;top:-100%;width:100%');

        this.contentWindow.onresize();
        this.contentWindow.onresize();
        assert.called(v.raf);
        v.raf.yield();
        assert.calledOnceWith(v.resized, v.html, 110);
        v.resized.reset(); v.raf.reset();

        v.html.style.width = '90px';
        v.resizer.resize();
        v.raf.yield();
        assert.calledOnceWith(v.resized, v.html, 90);

        v.resized.reset(); v.raf.reset();
        v.resizer.resize();
        v.raf.yield();
        refute.called(v.resized);
      });
    });
  });
});
