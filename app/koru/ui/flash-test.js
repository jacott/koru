isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const TH              = require('./test-helper');

  const {stub, spy, intercept} = TH;

  const sut  = require('./flash');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      TH.domTearDown();
    });

    test("click close", ()=>{
      sut.notice('click to close');

      spy(Dom, 'hideAndRemove');

      assert.dom('#Flash', flash =>{
        TH.click('.m');
        assert.calledWith(Dom.hideAndRemove, flash);
      });
    });

    test("click link", ()=>{
      sut.error(Dom.h({div: [
        {span: 'text'}, {a: {b: 'link'}, href: '#'}
      ]}));

      spy(Dom, 'hideAndRemove');
      spy(Dom, 'stopEvent');

      assert.dom('#Flash', flash =>{
        TH.click('b');
        refute.called(Dom.stopEvent);
        refute.called(Dom.hideAndRemove);
      });
    });

    test("hint", ()=>{
      sut.hint("this is a hint");
      assert.dom('#hint', 'this is a hint');
      assert.equals(sut.hintText, 'this is a hint');

      sut.hint();
      assert.dom('#hint', '');
    });

    test("call close", ()=>{
      intercept(Dom, 'hideAndRemove', elm => Dom.remove(elm));
      sut.confirm('msg 1');
      sut.confirm('msg 2');
      assert.dom('.m', 'msg 1', elm => {
        sut.close(elm);
      });

      assert.dom('.m', {count: 1});
    });

    test("close after seven seconds", ()=>{
      stub(koru, 'afTimeout');

      sut.notice('7 seconds to go');

      assert.calledWith(koru.afTimeout, TH.match.func, 7000);

      spy(Dom, 'hideAndRemove');

      assert.dom('#Flash', flash =>{
        koru.afTimeout.yield();
        assert.calledWith(Dom.hideAndRemove, flash);
      });
    });

    test("non-transient", ()=>{
      sut.confirm(Dom.h({
        div: [
          {span: 'New version available'},
          {button: 'refresh'},
          {button: 'dismiss'},
        ]
      }));

      assert.dom('#Flash', elm => {
        assert.dom('.m.notice:not(.transient)');
      });
    });

    test("msg translation", ()=>{
      sut.error('unexpected_error:no such book');

      assert.dom('#Flash>.m.error', "An unexpected error has occurred: no such book");
    });

    test("error", ()=>{
      stub(Dom, 'hideAndRemove', elm => Dom.remove(elm));
      sut.error('how now brown cow');

      assert.dom('#Flash>.error.m.transient', 'how now brown cow');

      sut.error('new message');

      assert.same(document.getElementsByClassName('error').length, 1);
      assert.called(Dom.hideAndRemove);

      TH.click('#Flash>.error.m');

      refute.dom('#Flash');
    });
  });
});
