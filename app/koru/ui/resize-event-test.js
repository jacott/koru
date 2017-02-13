isClient && define(function (require, exports, module) {
  const Dom = require('koru/dom');
  const TH  = require('./test-helper');

  const sut = require('./resize-event');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.raf = test.stub(window, 'requestAnimationFrame');
      v.html = Dom.h({div: 'foo', $style: "width:100px;height:150px"});
      document.body.appendChild(v.html);
      v.resizer = sut.onWidthResize(v.html, v.resized = test.stub());
    },

    tearDown() {
      Dom.remove(v.html);
      v = null;
    },

    "test resize width"() {
      assert.calledWith(v.raf, TH.match.func);
      v.raf.yield();
      v.raf.reset();
      refute.called(v.resized);

      assert.dom('.resize-detector', function () {
        v.html.style.width = '110px';
        assert.same(this.getAttribute('style'), 'position:relative;width:100%;height:0;pointer-events:none;visibility:hidden;');
        assert.same(this.firstChild.getAttribute('style'), 'position:absolute;left:0;width:100%;height:20px;overflow-x:scroll');
        assert.same(this.lastChild.getAttribute('style'), 'position:absolute;left:0;width:100%;height:20px;overflow-x:scroll');
        assert.same(this.firstChild.firstChild.getAttribute('style'), 'width:200%;height:100%');
        assert.same(this.lastChild.firstChild.getAttribute('style'), 'width:200vw;height:100%');

        TH.trigger(this.firstChild, 'scroll');
        TH.trigger(this.firstChild, 'scroll');
        assert.called(v.raf);
        v.raf.yield();
        assert.calledOnceWith(v.resized, v.html, 110);
        v.resized.reset(); v.raf.reset();
        assert.near(this.firstChild.scrollLeft, 110);
        assert.near(this.lastChild.scrollLeft, window.innerWidth*2 - 110);

        v.html.style.width = '90px';
        TH.trigger(this.firstChild, 'scroll');
        v.raf.yield();
        assert.calledOnceWith(v.resized, v.html, 90);
        assert.near(this.firstChild.scrollLeft, 90);
        assert.near(this.lastChild.scrollLeft, window.innerWidth*2 - 90);

        v.resized.reset(); v.raf.reset();
        TH.trigger(this.firstChild, 'scroll');
        v.raf.yield();
        refute.called(v.resized);

        v.html.style.width = '80px';
        this.firstChild.scrollLeft = 0;
        v.resizer.reset();
        assert.near(this.firstChild.scrollLeft, 80);
      });
    },
  });
});
