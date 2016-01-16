isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Dom = require('../dom');
  var sut = require('./in-place-form');
  var util = require('../util');
  var ipfTpl = require('../html!./in-place-form-test');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      document.body.appendChild(v.parent = document.createElement('div'));
      v.Ipf = Dom.newTemplate(util.deepCopy(ipfTpl));
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test defaults": function () {
      var sut = Dom.InPlaceForm.$render({doc: {}});

      assert.dom(sut, function () {
        assert.dom('input[type=text][name=name]', function () {
          assert.same(this.value, '');
        });
        assert.dom('fieldset', function () {
          assert.dom('button[name=apply]', 'Apply');
        });
      });
    },

    "test options": function () {
      test.stub(Dom.Form, 'field');
      sut._helpers.field.call(v.opts = {'html-form-notme': 'notme', 'html-me': 'html me', ext1: 'extend 1', value: '123',
                               name: 'theName', type: 'foo',
                               notthis: 'not this'});

      assert.calledWith(Dom.Form.field, {theName: '123'}, 'theName', {type: 'foo', me: 'html me'}, v.opts);
    },

    "test no doc": function () {
      var sut = Dom.InPlaceForm.$render({value: "foo"});

      assert.dom(sut, function () {
        assert.dom('input[type=text][name=name]', function () {
          assert.same(this.value, 'foo');
        });
        assert.dom('fieldset', function () {
          assert.dom('button[name=apply]', 'Apply');
        });
      });
    },

    "test render": function () {
      var sut = Dom.InPlaceForm.$render({
        doc: {foo: 'abc'}, applyName: 'Save', type: 'text',
        name: 'foo',  "html-id": 'My_foo', "html-form-id": "MyFormId", 'html-maxLength': 4});

      assert.dom(sut, function () {
        assert.same(this.id, "MyFormId");

        assert.dom('input#My_foo[type=text][name=foo][maxLength="4"]', function () {
          assert.same(this.value, 'abc');
        });
        assert.dom('fieldset', function () {
          assert.dom('button[name=apply]', 'Save');
        });
      });
    },

    "test custom Show/Edit templates": function () {
      sut.autoRegister(v.Ipf);
      var doc = {autoShowEdit: 'bar'};
      document.body.appendChild(v.Ipf.$autoRender(doc));

      assert.dom('#InPlaceFormTest', function () {
        assert.dom('[name=autoShowEdit].ui-editable.showTpl', 'bar');

        doc.autoShowEdit = 'foo';

        // this was stopping custom edit template from showing
        Dom.getMyCtx(this).updateAllTags();

        TH.click('[name=autoShowEdit].ui-editable.showTpl', 'foo');

        assert.dom('input.editTpl', {value: 'foo'});
      });
    },

    "test apply event": function () {
      var widget = Dom.InPlaceForm.newWidget({doc: {name: 'abc'}});
      widget.onSubmit(v.clickStub = function (arg) {
        assert.same(this, widget);
        v.arg = arg;
      });

      v.parent.appendChild(widget.element);

      assert.dom(widget.element, function () {
        TH.input('input', 'new text');
        TH.click('[name=apply]');
      });

      assert.same(v.arg, 'new text');

      test.spy(Dom.InPlaceForm, '$detachEvents');

      Dom.remove(widget.element);

      assert.calledWith(Dom.InPlaceForm.$detachEvents, widget.element);
    },

    "test ctrl+enter event": function () {
      var widget = Dom.InPlaceForm.newWidget({doc: {name: 'abc'}});
      widget.onSubmit(v.clickStub = function (arg) {
        assert.same(this, widget);
        v.arg = arg;
      });

      v.parent.appendChild(widget.element);

      assert.dom(widget.element, function () {
        TH.input('input', 'new text');
        TH.trigger('input', 'keydown', {which: 13});
        refute.same(v.arg, 'new text');
        TH.trigger('input', 'keydown', {which: 13, ctrlKey: true});
      });

      assert.same(v.arg, 'new text');

      test.spy(Dom.InPlaceForm, '$detachEvents');

      Dom.remove(widget.element);

      assert.calledWith(Dom.InPlaceForm.$detachEvents, widget.element);
    },

    "test enterSubmits": function () {
      var widget = Dom.InPlaceForm.newWidget({
        doc: {name: 'abc'},
        enterSubmits: true,
      });
      widget.onSubmit(v.clickStub = function (arg) {
        assert.same(this, widget);
        v.arg = arg;
      });

      v.parent.appendChild(widget.element);

      assert.dom(widget.element, function () {
        TH.input('input', 'new text');
        TH.trigger('input', 'keydown', {which: 13}); });

      assert.same(v.arg, 'new text');
    },

    "test delete event": function () {
      var widget = Dom.InPlaceForm.newWidget({doc: {name: 'abc'}, deleteName: 'Delete me', deleteConfirmMsg: 'Are you sure about it?'});
      widget.onDelete(v.clickStub = function () {
        assert.same(this, widget);
        v.arg = true;
      });

      v.parent.appendChild(widget.element);

      assert.dom(widget.element, function () {
        TH.click('[name=delete]', 'Delete me');
      });

      assert.dom('.Confirm.Dialog', function () {
        assert.dom('.ui-dialog.warn.cl>div', 'Are you sure about it?');
        TH.click('button[name=cancel]');
      });

      refute.dom('.Dialog');

      TH.click('[name=delete]');

      TH.click('.Confirm button[name=okay]');

      assert.same(v.arg, true);

      test.spy(Dom.InPlaceForm, '$detachEvents');
    },

    "test swap cancel": function () {
      v.parent.appendChild(v.elm = document.createElement('span'));

      var widget = Dom.InPlaceForm.swapFor(v.elm);

      assert.same(widget.swap, v.elm);


      assert.dom(v.parent, function () {
        assert.dom('form', function () {
          TH.click('[name=cancel]');
        });

        assert.dom('>span');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);

    },

    "test swap escape": function () {
      v.parent.appendChild(v.elm = document.createElement('span'));

      var widget = Dom.InPlaceForm.swapFor(v.elm, {doc: {name: 'foo', $reload: v.reload = test.stub()}});

      assert.same(widget.swap, v.elm);


      assert.dom(v.parent, function () {
        TH.trigger('form [name=name]', 'keyup', {which: 65});

        refute.dom('>span');

        TH.trigger('form [name=name]', 'keyup', {which: 27});

        assert.dom('>span');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);

      assert.called(v.reload);
    },

    "test swap close": function () {
      v.parent.appendChild(v.elm = document.createElement('span'));

      var widget = Dom.InPlaceForm.swapFor(v.elm);
      widget.close();

      assert.dom(v.parent, function () {
        assert.dom('>span');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);
    },
  });
});
