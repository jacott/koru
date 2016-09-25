isClient && define(function (require, exports, module) {
  var test, v;
  const Dom               = require('../dom');
  const buttonMenuTestTpl = require('../html!./button-menu-test');
  const util              = require('../util');
  const ButtonMenu        = require('./button-menu');
  const TH                = require('./test-helper');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.menu = Dom.newTemplate(util.deepCopy(buttonMenuTestTpl));
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test rendering": function () {
      document.body.appendChild(v.menu.$autoRender({}));

      assert.dom('#TestButtonMenu', function () {
        assert.dom('#FooMenu.buttonMenu', function () {
          assert.dom('>button[name=foo]+button[name=dropMenu]');
        });
      });
    },

    "test dropMenu": function () {
      document.body.appendChild(v.menu.$autoRender({}));

      assert.dom('#FooMenu.buttonMenu', function () {
        TH.trigger('[name=dropMenu]', 'click');
        assert.dom('div.dropMenu', function () {
          assert.dom('button[name=bar]');
        });
      });
    },
  });
});
