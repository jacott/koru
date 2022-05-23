isClient && define((require, exports, module) => {
  'use strict';
  const TemplateCompiler = require('koru/dom/template-compiler');
  const DomNav          = require('koru/ui/dom-nav');
  const TH              = require('./test-helper');
  const Dom             = require('../dom');
  const util            = require('../util');

  const {error$} = require('koru/symbols');

  const {stub, spy} = TH;

  const sut = require('./in-place-form');

  const ipfTpl = TemplateCompiler.toJavascript(`
<template name="Test.InPlaceForm">
  <ul id="InPlaceFormTest">
    {{editInPlace name="autoShowEdit"}}
    <template name="Show_autoShowEdit">
      <div>
        <button name="autoShowEdit" class="ui-editable showTpl">{{doc.autoShowEdit}}</button>
      </div>
    </template>
    <template name="Edit_autoShowEdit">
      <div>
        <input name="autoShowEdit" class="editTpl" value="{{doc.autoShowEdit}}">
      </div>
    </template>
  </ul>
</template>
`).toJson();

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    let Ipf, parent;
    beforeEach(() => {
      document.body.appendChild(parent = document.createElement('div'));
      Ipf = Dom.newTemplate(util.deepCopy(ipfTpl));
    });

    afterEach(() => {
      TH.domTearDown();
    });

    test('defaults', () => {
      const sut = Dom.tpl.InPlaceForm.$render({doc: {}});

      assert.dom(sut, () => {
        assert.dom('input[type=text][name=name]', (input) => {
          assert.same(input.value, '');
        });
        assert.dom('.actions', () => {
          assert.dom('button[name=apply]', 'Apply');
        });
      });
    });

    test('options', () => {
      stub(Dom.tpl.Form, 'field');
      const opts = {
        'html-form-notme': 'notme', 'html-me': 'html me', ext1: 'extend 1', value: '123',
        name: 'theName', type: 'foo',
        notthis: 'not this'};
      sut._helpers.field.call(opts);

      assert.calledWith(Dom.tpl.Form.field, {theName: '123'}, 'theName',
                        {type: 'foo', me: 'html me'}, opts);
    });

    test('no doc', () => {
      const sut = Dom.tpl.InPlaceForm.$render({value: 'foo'});

      assert.dom(sut, () => {
        assert.dom('input[type=text][name=name]', (input) => {
          assert.same(input.value, 'foo');
        });
        assert.dom('.actions', () => {
          assert.dom('button[name=apply]', 'Apply');
        });
      });
    });

    test('render', () => {
      const sut = Dom.tpl.InPlaceForm.$render({
        doc: {foo: 'abc'}, applyName: 'Save', type: 'text',
        name: 'foo', 'html-id': 'My_foo', 'html-form-id': 'MyFormId', 'html-maxLength': 4});

      assert.dom(sut, () => {
        assert.same(sut.id, 'MyFormId');

        assert.dom('input#My_foo[type=text][name=foo][maxLength="4"]', (input) => {
          assert.same(input.value, 'abc');
        });
        assert.dom('.actions', () => {
          assert.dom('button[name=apply]', 'Save');
        });
      });
    });

    test('custom Show/Edit templates', () => {
      sut.autoRegister(Ipf);
      const doc = {autoShowEdit: 'bar'};
      document.body.appendChild(Ipf.$autoRender(doc));

      assert.dom('#InPlaceFormTest', (elm) => {
        assert.dom('[name=autoShowEdit].ui-editable.showTpl', 'bar');

        doc.autoShowEdit = 'foo';

        // this was stopping custom edit template from showing
        Dom.myCtx(elm).updateAllTags();

        TH.click('[name=autoShowEdit].ui-editable.showTpl', 'foo');

        assert.dom('input.editTpl', {value: 'foo'});
      });
    });

    test('click with selection does nothing', () => {
      sut.autoRegister(Ipf);
      const doc = {autoShowEdit: 'bar', $reload: stub()};
      document.body.appendChild(Ipf.$autoRender(doc));

      assert.dom('#InPlaceFormTest', () => {
        const range = document.createRange();
        Dom.setRange(range);
        const editable = Dom('[name=autoShowEdit].ui-editable.showTpl');
        TH.click(editable);
        TH.click('form [name=cancel]');
        DomNav.selectNode(editable);
        TH.click(editable);
        refute.dom('form');
      });
    });

    test('saveField', () => {
      const form = Dom.h({form: [{input: [], name: 'name'}], class: 'submitting'});
      let doc = {$save: stub()};
      const widget = {close: stub()};
      sut.saveField(doc, form, widget);
      assert.className(form, 'submitting');
      refute.called(doc.$save);
      assert.called(widget.close);

      widget.close.reset();
      doc = {$save() {this[error$] = {name: [['is_invalid']]}}, changes: {name: 'nn'}};
      sut.saveField(doc, form, widget);
      refute.className(form, 'submitting');
      assert.dom(form, (form) => {
        assert.dom('[name=name].error+error>div', 'is not valid');
      });

      refute.called(widget.close);
      doc = {$save() {}, changes: {name: 'nn'}};

      sut.saveField(doc, form, widget);

      assert.called(widget.close);
    });

    test('apply event', () => {
      let arg;
      const widget = Dom.tpl.InPlaceForm.newWidget({doc: {name: 'abc'}});
      widget.onSubmit(function (_arg) {
        assert.same(this, widget);
        arg = _arg;
      });

      parent.appendChild(widget.element);

      assert.dom(widget.element, () => {
        TH.input('input', 'new text');
        TH.click('[name=apply]');
      });

      assert.same(arg, 'new text');

      spy(Dom.tpl.InPlaceForm, '$detachEvents');

      Dom.remove(widget.element);

      assert.calledWith(Dom.tpl.InPlaceForm.$detachEvents, widget.element);
    });

    test('ctrl or meta+enter event', () => {
      let arg;
      const widget = Dom.tpl.InPlaceForm.newWidget({doc: {name: 'abc'}});
      widget.onSubmit(function (_arg) {
        assert.same(this, widget);
        arg = _arg;
      });

      parent.appendChild(widget.element);

      assert.dom(widget.element, () => {
        TH.input('input', 'new text');
        TH.trigger('input', 'keydown', {which: 13});
        refute.same(arg, 'new text');
        TH.trigger('input', 'keydown', {which: 13, ctrlKey: true});
        assert.same(arg, 'new text');

        TH.input('input', 'meta text');
        TH.trigger('input', 'keydown', {which: 13, metaKey: true});
        assert.same(arg, 'meta text');
      });

      spy(Dom.tpl.InPlaceForm, '$detachEvents');

      Dom.remove(widget.element);

      assert.calledWith(Dom.tpl.InPlaceForm.$detachEvents, widget.element);
    });

    test('enterSubmits', () => {
      let arg;
      const widget = Dom.tpl.InPlaceForm.newWidget({
        doc: {name: 'abc'},
        enterSubmits: true,
      });
      widget.onSubmit(function (_arg) {
        assert.same(this, widget);
        arg = _arg;
      });

      parent.appendChild(widget.element);

      assert.dom(widget.element, () => {
        TH.input('input', 'new text');
        TH.trigger('input', 'keydown', {which: 13, shiftKey: true});
        refute.same(arg, 'new text');
        TH.trigger('input', 'keydown', {which: 13})});

      assert.same(arg, 'new text');
    });

    test('delete event', () => {
      let arg;
      const widget = Dom.tpl.InPlaceForm.newWidget({
        doc: {name: 'abc'}, deleteName: 'Delete me', deleteConfirmMsg: 'Are you sure about it?'});

      widget.onDelete(function () {
        assert.same(this, widget);
        arg = true;
      });

      parent.appendChild(widget.element);

      assert.dom(widget.element, () => {
        TH.click('[name=delete]', 'Delete me');
      });

      assert.dom('.Confirm.Dialog', () => {
        assert.dom('.ui-dialog.warn.cl>div', 'Are you sure about it?');
        TH.click('button[name=cancel]');
      });

      refute.dom('.Dialog');

      TH.click('[name=delete]');

      TH.click('.Confirm button[name=okay]');

      assert.same(arg, true);

      spy(Dom.tpl.InPlaceForm, '$detachEvents');
    });

    test('swap cancel', () => {
      const elm = document.createElement('span');
      parent.appendChild(elm);

      const widget = Dom.tpl.InPlaceForm.swapFor(elm);

      assert.same(widget.swap, elm);

      assert.dom(parent, () => {
        assert.dom('form', () => {
          TH.click('[name=cancel]');
        });

        assert.dom('>span');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);
    });

    test('swap escape', () => {
      const elm = document.createElement('span');
      parent.appendChild(elm);

      const reload = stub();
      const widget = Dom.tpl.InPlaceForm.swapFor(elm, {doc: {name: 'foo', $reload: reload}});

      assert.same(widget.swap, elm);

      assert.dom(parent, () => {
        TH.trigger('form [name=name]', 'keydown', {which: 65});

        refute.dom('>span');

        TH.trigger('form [name=name]', 'keydown', {which: 27});

        assert.dom('>span');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);

      assert.called(reload);
    });

    test('swap close', () => {
      const elm = document.createElement('button');
      parent.appendChild(elm);

      const widget = Dom.tpl.InPlaceForm.swapFor(elm);
      widget.close();

      assert.dom(parent, () => {
        assert.dom('>button');
      });

      assert.isNull(widget.swap);
      assert.isNull(widget.element._bart);

      assert.same(document.activeElement, elm);
    });

    test('GenericShow', () => {
      Ipf = Dom.newTemplate(TemplateCompiler.toJavascript(`
<template name="Test.InPlaceForm">
  <ul id="InPlaceFormTest">
    {{editInPlace name="nickname"}}
  </ul>
</template>
`).toJson());

      sut.autoRegister(Ipf);
      const doc = {nickname: 'The Bard of Avon'};
      document.body.appendChild(Ipf.$autoRender(doc));

      assert.dom('#InPlaceFormTest', (elm) => {
        assert.dom('>label.nickname-field>span.label', 'Nickname');
        assert.dom('button.value.ui-editable[name=nickname]', 'The Bard of Avon');

        doc.nickname = void 0;
        Dom.myCtx(elm).updateAllTags();

        assert.dom('button.value.ui-editable[name=nickname]', '');

        doc.nickname = 'Ace';
        Dom.myCtx(elm).updateAllTags();

        TH.click('button.value.ui-editable[name=nickname]', 'Ace');

        assert.dom('form>input[name=nickname]', {value: 'Ace'});
      });
    });
  });
});
