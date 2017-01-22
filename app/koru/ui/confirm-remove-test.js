isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./confirm-remove');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test cancel"() {
      sut.show('foo bar', v.confirm = test.stub());

      assert.dom('.Dialog', function () {
        assert.dom('#ConfirmRemove h1', 'Remove foo bar?');
        TH.click('[name=cancel]');
      });
      refute.dom('.Dialog');
      refute.called(v.confirm);
    },

    "test description"() {
      sut.show('with desc', test.stub(), {description: Dom.h({div: 'how now brown cow'})});

      assert.dom('.Dialog', function () {
        assert.dom('div', 'how now brown cow');
      });
    },

    "test okay"() {
      sut.show('foo bar', v.confirm = test.stub());

      assert.dom('.Dialog', function () {
        TH.click('[name=okay]');
      });
      refute.dom('.Dialog');
      assert.called(v.confirm);
    },
  });
});
