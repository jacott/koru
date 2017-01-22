isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Dom = require('../dom');
  var Dialog = require('./dialog');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
    },

    tearDown() {
      Dom.removeChildren(document.body);
      v = null;
    },

    "test open / close"() {
      Dialog.open(Dom.html('<form id="Foo"><input type="text"></form>'));
      assert.dom('.Dialog', function () {
        assert.dom('form#Foo', function () {
          assert.dom('input', function () {
            assert.same(document.activeElement, v.input = this);
          });
        });
      });

      assert.isTrue(Dialog.isOpen());

      Dialog.open(Dom.html('<div id="Nested" tabindex="0"><input></div>'), 'nofocus');

      assert.dom('.Dialog:last-child>span.startTab', function () {
        assert.same(document.activeElement, this);
      });

      assert.isTrue(Dialog.isOpen());

      Dialog.close();

      refute.dom('#Nested');

      assert.isTrue(Dialog.isOpen());

      Dialog.close('Foo');

      Dialog.open(Dom.html('<div id="Nested" tabindex="0"><input></div>'));
      assert.dom('#Nested', function () {
        assert.same(document.activeElement, this);
      });

      Dialog.close();

      refute.dom('.Dialog');

      assert.isFalse(Dialog.isOpen());
    },

    "test full wrapping"() {
      Dialog.open(Dom.html('<div id="foo">Foo!!</div>'));

      assert.dom('.Dialog', function () {
        assert.dom('>.dialogContainer>.ui-dialog>#foo', 'Foo!!');
      });
    },

    "test partial wrapping"() {
      Dialog.open(Dom.html('<div id="foo" class="ui-dialog">Foo!!</div>'));

      assert.dom('.Dialog', function () {
        assert.dom('>.dialogContainer>#foo.ui-dialog', 'Foo!!');
      });
    },

    'test confirmDialog'() {
      var data = {
        classes: 'small',
        content: {
          $autoRender(arg) {
            v.data = arg;
            return Dom.html('<h1>This is the message</h1>');
          },
        },
        okay: 'Foo',
        callback(result, form) {
          assert.same(this, data);
          assert.same(form, v.form);
          v.result = result;
        }
      };
      Dialog.confirm(data);

      assert.same(v.data, data);

      assert.dom('.Dialog.Confirm', function () {
        v.form = this;
        assert.dom('.dialogContainer .ui-dialog.small', function () {
          assert.dom('h1', 'This is the message');
          assert.dom('.actions', function () {
            assert.dom('button#okay[name=okay]', 'Foo', function () {
              TH.click(this);
            });
          });
        });
      });
      refute.dom('.Dialog');
      assert.isTrue(v.result);
    },

    "test modalize"() {
      Dialog.open(Dom.html('<form id="Foo"></form>'));

      assert.dom('.Dialog', function () {
        TH.trigger(this, 'keydown', {which: 27});
      });

      refute.dom('.Dialog');
    },

    'test cancel confirmDialog with defaults '() {
      var data = {
        content: 'bla',
        callback: function(value) {
          v.result = value;
        }
      };

      Dialog.confirm(data);

      assert.dom('.Dialog.Confirm', function () {
        assert.dom('.startTab', function () {
          assert.same(document.activeElement, this);
        });
        assert.dom('.dialogContainer .ui-dialog', function () {

          assert.dom('div', 'bla');
          assert.dom('.actions', function () {
            assert.dom('button#cancel[name=cancel]', 'Cancel', function () {
              TH.click(this);
            });
          });
        });
      });
      refute.dom('.Dialog');
      assert.isFalse(v.result);
    },
  });
});
