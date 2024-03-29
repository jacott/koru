isClient && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Route           = require('./route');
  const TH              = require('./test-helper');
  const Dom             = require('../dom');
  const formTpl         = require('../html!./form-test');
  const util            = require('../util');

  const {stub, spy, match: m} = TH;

  const {error$} = require('koru/symbols');

  const Form = require('./form');

  const $ = Dom.current;

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      v.Form = Dom.newTemplate(util.deepCopy(formTpl));
    });

    afterEach(() => {
      Dom.removeChildren(document.body);
      Dom.tpl.Test = undefined;
      v = {};
    });

    test('labelField', () => {
      const label = Form.LabelField.$autoRender({
        name: 'foo',
        value: Dom.h({button: 'val'}),
        label: 'my foo',
      });
      assert.dom(label, function () {
        assert.className(this, 'label_foo');
        assert.dom('span.name', 'my foo');
        assert.dom('button', 'val');
      });
    });

    group('selectList', () => {
      test('Select.', () => {
        const selectList = v.Form.TestSelect;
        selectList.$helpers({
          fooList() {
            return [['a', 'A'], ['b', 'B']];
          },
        });
        document.body.appendChild(selectList.$autoRender({foo_id: 'b'}));
        assert.dom('select', function () {
          assert.dom('option:not([selected])', {value: 'a', text: 'A'});
          assert.dom('option[selected=selected]', {value: 'b', text: 'B'});
        });
      });

      test('lazy list, popupClass', () => {
        function selectList() {return v.list}

        const elm = Form.field({foo_id: 'b'}, 'foo_id', {
          displayValue: 'd foo', selectList,
          type: 'selectMenu',
          includeBlank: 'none',
          popupClass: 'fooClass',
        });

        document.body.appendChild(elm);

        v.list = [['a', 'A'], ['b', 'B']];
        TH.selectMenu('.select', 'a', function () {
          assert(document.querySelector('#SelectMenu.fooClass'));
          TH.click(this);
        });

        assert.dom('.select', 'A');
      });

      test('inclusionIn', () => {
        const selectList = v.Form.TestSelectMenu;
        selectList.$helpers({
          fooList() {
            return 'inclusionIn';
          },
        });

        const doc = {
          constructor: {
            $fields: {
              foo_id: {inclusion: {in: ['a', 'b']}},
            },
          },
          foo_id: 'b',
        };

        document.body.appendChild(selectList.$autoRender(doc));

        assert.dom('[data-errorField="foo_id"]', function () {
          assert.dom('button[name=foo_id].select.fuz', 'b');
          TH.selectMenu('.select', TH.match.field('_id', 'a'), function () {
            assert.dom(this.parentNode, function () {
              assert.dom('li.selected', 'b');
            });
            TH.click(this);
          });
          assert.dom('.select', 'a');
          assert.dom('[type=hidden]', {value: 'a'});
        });
      });

      test('SelectMenu', () => {
        const selectList = v.Form.TestSelectMenu;
        selectList.$helpers({
          fooList() {
            return [[0, 'A'], ['b', Dom.h({i: 'B'})]];
          },
        });
        document.body.appendChild(selectList.$autoRender({foo_id: 'b'}));
        assert.dom('[data-errorField="foo_id"]', function () {
          assert.dom('button[name=foo_id].select.fuz', 'B');
          TH.selectMenu('.select', TH.match.field('_id', 0), function () {
            assert.dom(this.parentNode, function () {
              assert.dom('li.selected', 'B');
            });
            return true;
          });
          assert.dom('.select', 'A');
          assert.dom('[type=hidden]', {value: '0'});
          TH.selectMenu('.select', TH.match.field('_id', ''), {menu() {
            assert.dom('li:first-child>i.blank', 'blanky blank');
            assert.dom('li:nth-child(2).selected', 'A');
            assert.dom('li:last-child:not(.selected)', 'B');
            return true;
          }});
          assert.dom('.select', 'blanky blank');
          assert.dom('[type=hidden]', {value: ''});
        });

        selectList.$events({
          'change input[name=foo_id]': v.onchange = stub(),
        });
        Dom.removeChildren(document.body);

        document.body.appendChild(selectList.$autoRender({}));
        assert.dom('[data-errorField="foo_id"]', function () {
          assert.dom('button[name=foo_id].select.fuz', 'blanky blank');
          TH.selectMenu('.select', TH.match.field('_id', 0));
          assert.dom('.select', 'A');
          assert.dom('[type=hidden]', {value: '0'});
        });
        assert.called(v.onchange);
      });
    });

    test('genderList', () => {
      assert.equals(Dom._helpers.genderList(), [
        ['f', 'Female'],
        ['m', 'Male'],
        ['n', 'Non binary'],
      ]);
    });

    test('fillDoc', () => {
      let form = Dom.h({form: [
        {button: 'hello', $name: 'foo_id'},
        {input: '', $name: 'bar', $value: 'barVal'},
        {input: '', $name: 'other', $value: 'otherV'},
      ]});

      let doc = {
        constructor: {$fields: {foo_id: 1, bar: 1}},
        foo_id: 'fv',
      };

      Form.fillDoc(doc, form);

      assert.equals(doc.bar, 'barVal');
      assert.equals(doc.foo_id, 'fv');
      assert.equals(doc.other, undefined);

      assert.equals(Form.fillDoc({}, form), {bar: 'barVal', other: 'otherV'});

      form.querySelector('[name=bar]').value = '';
      assert.equals(Form.fillDoc({}, form), {bar: undefined, other: 'otherV'});
    });

    test('helper elmId', () => {
      const elmId = Dom._helpers.elmId;
      assert.same(elmId.call({_id: 'fooId'}, 'bar'), 'bar_fooId');

      assert.same(elmId.call({_id: 'fooId', constructor: {modelName: 'Baz'}}), 'Baz_fooId');
    });

    test('submitFunc', () => {
      const top = Dom.h({
        id: 'top',
        div: {
          class: 'fields',
          div: [
            {input: '', $name: 'name', $value: 'foo'},
            {input: '', $name: 'age', $value: '12'},
          ],
        },
      });
      document.body.appendChild(top);

      let constructor = {
        $fields: {name: 1, age: 2},
      };

      const ctx = Dom.setCtx(top);
      ctx.data = {
        constructor,
        $save() {
          this[error$] = {name: [['bad name']]};
        },
      };

      stub(Dom, 'stopEvent');

      const sf = Form.submitFunc('top', v.opts = {
        success: v.success = stub(),
      });

      sf();

      assert.called(Dom.stopEvent);

      assert.same(ctx.data.name, 'foo');
      assert.same(ctx.data.age, '12');

      assert.dom('#top', function () {
        assert.dom('[name=name].error+error>div', 'bad name');
      });

      refute.called(v.success);

      ctx.data = {
        constructor,
        $save() {
          return true;
        },
      };

      sf();

      assert.called(v.success);

      v.opts.save = stub().returns(true);
      v.opts.success = 'back';

      stub(Route.history, 'back');

      sf();

      assert.calledWith(v.opts.save, ctx.data, top.querySelector('.fields'));
      assert.called(Route.history.back);

      v.opts.success = {};
      stub(Route, 'replacePath');

      sf();

      assert.calledWith(Route.replacePath, v.opts.success);
    });

    test('helper checked', () => {
      const elmStub = {tagName: 'INPUT'};
      stub(Dom, 'setClass');
      stub(Dom, 'setBoolean');
      TH.stubProperty(Dom.current, 'element', {get() {return elmStub}});
      Dom._helpers.checked(true);
      refute.called(Dom.setClass);
      assert.calledWith(Dom.setBoolean, 'checked', true);

      Dom.setBoolean.reset();
      elmStub.tagName = 'BUTTON';
      Dom._helpers.checked(false);
      assert.calledOnceWith(Dom.setClass, 'on', false);
      refute.called(Dom.setBoolean);

      Dom.setClass.reset();
      Dom._helpers.checked(true, 'foo');
      assert.calledOnceWith(Dom.setClass, 'foo', true);
    });

    group('modalize', () => {
      beforeEach(() => {
        document.body.appendChild(Dom.textToHtml(
          '<div id="top">' +
            '<div class="ta"><input type="text" id="os" value="outside txt"></div>' +
            '<div class="foo"><div class="bar">' +
            '<textarea id="sta">ta</textarea>' +
            '<div id="sce" contenteditable="true">ce</div>' +
            '<button type="button" id="sb" value="notme">' +
            '<input type="password" id="sp" value="hidden">' +
            '<input type="text" id="st" value="txt">' +
            '</div></div></div>',
        ));
        v.func = stub();
        Dom.tpl.Form.modalize(document.querySelector('.bar'), v.func);
      });

      afterEach(() => {
        Dom.tpl.Form.cancelModalize('all');
      });

      group('addChangeFields', () => {
        beforeEach(() => {
          Dom.tpl.TestData = v.Form.TestData;
          v.doc = {
            myData: {
              foo: 'x', fooField: 'ff1',
            },
            changes: {changes: 1},
            $invertChanges(changes) {
              return {asChanges: changes};
            },

            $save: v.save = stub(),
          };
        });

        afterEach(() => {
          delete Dom.tpl.TestData;
        });

        test('defaults', () => {
          v.save.onCall(0).returns(false).onCall(1).returns(true);
          Form.addChangeFields({template: Dom.tpl.TestData, fields: ['fooField'],
                                undo: v.onChange = stub()});
          document.body.appendChild(Dom.tpl.TestData.$autoRender(v.doc));
          TH.change('[name=fooField]', 'bad');
          refute.called(v.onChange);
          TH.change('[name=fooField]', 'nv');
          assert.calledWith(v.onChange, v.doc, {changes: 1}, {asChanges: {changes: 1}});
        });

        test('string update', () => {
          v.doc.myUpdate = stub().returns({fooField: [['is_invalid']]});
          Form.addChangeFields({template: Dom.tpl.TestData, fields: ['fooField'],
                                update: 'myUpdate',
                                undo: v.onChange = stub()});
          document.body.appendChild(Dom.tpl.TestData.$autoRender(v.doc));
          TH.change('[name=fooField]', 'bad');
          assert.calledWith(v.doc.myUpdate, 'fooField', 'bad', v.onChange);
          assert.dom('[name=fooField].error+.errorMsg', 'is not valid');
        });

        test('function update', () => {
          const myUpdate = stub().returns({fooField: [['is_invalid']]});
          Form.addChangeFields({template: Dom.tpl.TestData, fields: ['fooField'],
                                update: myUpdate,
                                undo: v.onChange = stub()});
          document.body.appendChild(Dom.tpl.TestData.$autoRender(v.doc));
          TH.change('[name=fooField]', 'bad');
          assert.calledWith(myUpdate, v.doc, 'fooField', 'bad', v.onChange);
        });
      });

      test('pointerdown and nesting', () => {
        const removeEventListener = spy(document, 'removeEventListener');
        TH.trigger('#sp', 'pointerdown');

        refute.called(v.func);

        TH.trigger('.foo', 'pointerdown');

        assert.calledWith(v.func, TH.match((event) => {
          assert.same(event.type, 'pointerdown');
          assert.same(event.target, document.querySelector('.foo'));
          return true;
        }));

        // testing replacement

        Dom.tpl.Form.modalize('.foo', v.func2 = stub());

        v.func.reset();

        TH.trigger('#top', 'pointerdown');

        refute.called(v.func);
        assert.called(v.func2);

        assert.same(Dom.tpl.Form.cancelModalize(), document.querySelector('.bar'));

        refute.called(removeEventListener);

        v.func2.reset();

        TH.trigger('.foo', 'pointerdown');

        assert.called(v.func);
        refute.called(v.func2);

        assert.same(Dom.tpl.Form.cancelModalize(), null);

        assert.called(removeEventListener);
      });

      test('keydown', () => {
        TH.trigger('#sp', 'keydown', {which: 26});
        TH.trigger('.foo', 'keydown', {which: 26});
        TH.trigger('#st', 'keydown', {which: 27});
        TH.trigger('#sta', 'keydown', {which: 27});
        TH.trigger('#sce', 'keydown', {which: 27});
        TH.trigger('#sp', 'keydown', {which: 27});

        refute.called(v.func);

        TH.trigger('.foo', 'keydown', {which: 27});
        TH.trigger('#sb', 'keydown', {which: 27});
        TH.trigger('#os', 'keydown', {which: 27});

        assert.calledWith(v.func, TH.match(function (event) {
          assert.same(event.type, 'keydown');
          return event.target === document.querySelector('.foo');
        }));

        assert.same(v.func.callCount, 3);
      });
    });

    test('PlainTextEditor', () => {
      document.body.appendChild(Dom.tpl.Test.Form.TestPlainTextEditor.$autoRender({name: 'foo\nbar'}));

      assert.dom('#TestPlainTextEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.input.plainText[placeholder="Foo"][data-errorfield="name"]:not([type])', 'foobar', function () {
          assert.same(this.innerHTML, 'foo<br>bar');
          this.innerHTML = 'new<br><b>content</b>';
          assert.same(this.value, 'new\ncontent');
          this.value = 'how now';
          assert.same(this.value, 'how now');
        });
      });
    });

    test('RichTextEditor', () => {
      Dom.tpl.Test.Form.TestRichTextEditor.$helpers({
        testFormMentions() {
          return {
            mentions: {'@': 'testMentions'},
          };
        },
      });
      document.body.appendChild(Dom.tpl.Test.Form.TestRichTextEditor.$autoRender({name: Dom.h([{b: 'foo'}, '\nbar'])}));

      assert.dom('#TestRichTextEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.richTextEditor[data-errorfield="name"]:not([type])', function () {
          const data = $.data(this);
          assert.equals(data.extend.mentions, {'@': 'testMentions'});

          assert.dom('.rtToolbar');
          assert.dom('>.input[placeholder="Foo"]', 'foobar', function () {
            assert.same(this.innerHTML, '<b>foo</b><br>bar');
          });
          assert.same(this.value.innerHTML, '<b>foo</b><br>bar');
          this.value = Dom.h({ul: [{li: 'how'}, {li: 'now'}]});
          assert.dom('>.input', 'hownow', function () {
            assert.same(this.innerHTML, '<ul><li>how</li><li>now</li></ul>');
          });
        });
      });
    });

    test('format', () => {
      document.body.appendChild(Dom.tpl.Test.Form.TestFormat.$autoRender({foo: 'fuz'}));

      assert.dom('body>div', function () {
        assert.same(this.id, 'FOO_fuz_bar');
      });
    });

    test('passing data arg', () => {
      const TestData = v.Form.TestData;

      TestData.$helpers({
        myData() {
          return {
            foo: 'hello foo',
            fooField: 'the field',
          };
        },
      });

      assert.dom(TestData.$render({}), function () {
        assert.dom('#fooId:not([data])', {value: 'hello foo'});
        assert.dom('#fieldId', {value: 'the field'});
        assert.dom('.value', 'hello foo');
      });
    });

    test('renderError', () => {
      const form = Dom.h({div: [{$name: 'foo'}, {$name: 'bar'}]});

      Form.renderError(form, 'foo', ['is_required']);
      Form.renderError(form, 'bar', 'bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg>div', 'bar msg');
        assert.dom('[name=foo].error+.errorMsg>div', "can't be blank");

        Form.renderError(form, 'bar', 'msg 2');

        refute.dom('.errorMsg+.errorMsg');

        assert.dom('[name=bar].error+.errorMsg>div', 'msg 2');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    });

    test('renderErrors from koru.Error', () => {
      const error = new koru.Error(400, {foo: ['is_invalid'], bar: ['is_required']});

      const form = Dom.h({div: [{$name: 'foo'}, {$name: 'bar'}]});
      Form.renderErrors(error, form);

      assert.dom(form, (elm) => {
        assert.dom('[name=foo].error+.errorMsg>div', 'is not valid');
        assert.dom('[name=bar].error+.errorMsg>div', "can't be blank");
      });
    });

    test('errorTop renderError', () => {
      const form = Dom.h({
        style: 'margin-left:20px;width: 300px;height:100px',
        div: ['hello world', {br: ''}, {$name: 'foo'},
              {input: [], name: 'bar',
               style: 'margin-left:200;width:50px;height:20px',
               class: 'errorTop'}],
      });
      document.body.appendChild(form);

      Form.renderError(form, 'foo', 'foo msg');
      Form.renderError(form, 'bar', v.barMsg = 'big long message bar msg');

      assert.dom(form, () => {
        assert.dom('[name=bar].error+.errorMsg.animate', v.barMsg, (elm) => {
          const rect = elm.getBoundingClientRect();

          assert.near(rect.top, 15.5);
          assert.near(rect.left, 20);
          assert.same(elm.style.position, 'absolute');
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    });

    group('displayField', () => {
      test('defaults', () => {
        assert.dom(Dom._helpers.displayField.call({foo: 'bar'}, 'foo'), (elm) => {
          assert.dom('span.name', 'Foo');
          assert.dom('span.value', 'bar');
        });
      });

      test('options', () => {
        assert.dom(Dom._helpers.displayField('foo', {data: {foo: {name: 'foo obj'}}}), (elm) => {
          assert.dom('span.name', 'Foo');
          assert.dom('span.value', 'foo obj');
        });
      });
    });

    test('errorRight renderError', () => {
      const form = Dom.h({
        $style: 'width: 300px;height:100px',
        div: ['hello world', {br: ''}, {$name: 'foo'},
              {input: '', $name: 'bar',
               $style: 'margin-left:200px;width:50px;height:20px',
               class: 'errorTop errorRight'}],
      });
      document.body.appendChild(form);

      Form.renderError(form, 'foo', 'foo msg');
      Form.renderError(form, 'bar', 'big long message bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg.animate', v.barMsg, (elm) => {
          const eRect = elm.getBoundingClientRect();
          const iRect = Dom('input').getBoundingClientRect();

          assert.near(iRect.right, eRect.right);
          assert.near(iRect.top, eRect.bottom);
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    });
  });
});
