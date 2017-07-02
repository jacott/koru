isClient && define(function (require, exports, module) {
  const Dom = require('../dom');
  const TH  = require('./test-helper');

  const sut = require('./confirm-remove');
  var v;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test cancel"() {
      sut.show({onConfirm: v.confirm = this.stub()});

      assert.dom('.Dialog', function () {
        assert.dom('#ConfirmRemove h1', 'Are you sure?');
        TH.click('[name=cancel]');
      });
      refute.dom('.Dialog');
      refute.called(v.confirm);
    },

    "test options"() {
      sut.show({
        title: 'my title',
        classes: 'myclass',
        okay: 'my remove',
        description: Dom.h({div: 'how now brown cow'}),
        onConfirm: v.onConfirm = this.stub(),
      });

      assert.dom('.Dialog', function () {
        assert.dom('.ui-dialog.myclass');
        assert.dom('h1', 'my title');
        assert.dom('div', 'how now brown cow');
        assert.dom('[name=okay]', 'my remove');
      });
    },

    "test name"() {
      sut.show({name: 'foo', onConfirm() {}});

      assert.dom('.Dialog', function () {
        assert.dom('h1', 'Remove foo?');
      });
    },

    "test okay"() {
      sut.show({onConfirm: v.confirm = this.stub()});

      TH.click('.Dialog [name=okay]');
      refute.dom('.Dialog');
      assert.called(v.confirm);
    },
  });
});
