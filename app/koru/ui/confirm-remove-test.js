isClient && define((require, exports, module)=>{
  const Dom             = require('../dom');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./confirm-remove');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      TH.domTearDown();
    });

    test("cancel", ()=>{
      const onConfirm = stub();
      sut.show({onConfirm});

      assert.dom('.Dialog', ()=>{
        assert.dom('#ConfirmRemove h1', 'Are you sure?');
        TH.click('[name=cancel]');
      });
      refute.dom('.Dialog');
      refute.called(onConfirm);
    });

    test("options", ()=>{
      const onConfirm = stub();
      sut.show({
        title: 'my title',
        classes: 'myclass',
        okay: 'my remove',
        description: Dom.h({div: 'how now brown cow'}),
        onConfirm,
      });

      assert.dom('.Dialog', ()=>{
        assert.dom('.ui-dialog.myclass');
        assert.dom('h1', 'my title');
        assert.dom('div', 'how now brown cow');
        assert.dom('[name=okay]', 'my remove');
      });
    });

    test("name", ()=>{
      sut.show({name: 'foo', onConfirm() {}});

      assert.dom('.Dialog h1', 'Remove foo?');
    });

    test("okay", ()=>{
      const onConfirm = stub();
      sut.show({onConfirm});

      TH.click('.Dialog [name=okay]');
      refute.dom('.Dialog');
      assert.called(onConfirm);
    });
  });
});
