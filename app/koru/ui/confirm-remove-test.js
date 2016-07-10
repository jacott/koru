isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./confirm-remove');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test cancel": function () {
      sut.show('foo bar', v.confirm = test.stub());

      assert.dom('.Dialog', function () {
        assert.dom('#ConfirmRemove h1', 'Remove foo bar?');
        TH.click('[name=cancel]');
      });
      refute.dom('.Dialog');
      refute.called(v.confirm);
    },

    "test description": function () {
      sut.show('with desc', test.stub(), {description: Dom.h({div: 'how now brown cow'})});

      assert.dom('.Dialog', function () {
        assert.dom('div', 'how now brown cow');
      });
    },

    "test okay": function () {
      sut.show('foo bar', v.confirm = test.stub());

      assert.dom('.Dialog', function () {
        TH.click('[name=okay]');
      });
      refute.dom('.Dialog');
      assert.called(v.confirm);
    },
  });
});
