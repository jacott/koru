isClient && define(function (require, exports, module) {
  var test, v;
  const Dom     = require('../dom');
  const formTpl = require('../html!./form-test');
  const util    = require('../util');
  const Form    = require('./form');
  const Route   = require('./route');
  const TH      = require('./test-helper');

  const $ = Dom.current;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.Form = Dom.newTemplate(util.deepCopy(formTpl));
    },

    tearDown() {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      v = null;
    },

    "selectList": {
      "test Select."() {
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
      },

      "test SelectMenu"() {
        const selectList = v.Form.TestSelectMenu;
        selectList.$helpers({
          fooList() {
            return [['a', 'A'], ['b', 'B']];
          },
        });
        document.body.appendChild(selectList.$autoRender({foo_id: 'b'}));
        assert.dom('[data-errorField="foo_id"]', function () {
          assert.dom('button[name=foo_id].select.fuz', 'B');
          TH.selectMenu('.select', TH.match.field('id', 'a'));
          assert.dom('.select', 'A');
          assert.dom('[type=hidden]', {value: 'a'});
          TH.selectMenu('.select', TH.match.field('id', ''));
          assert.dom('.select', 'blanky blank');
          assert.dom('[type=hidden]', {value: ''});
        });

        selectList.$events({
          'change input[name=foo_id]': v.onchange = test.stub(),
        });
        Dom.removeChildren(document.body);
        document.body.appendChild(selectList.$autoRender({}));
        assert.dom('[data-errorField="foo_id"]', function () {
          assert.dom('button[name=foo_id].select.fuz', 'blanky blank');
          TH.selectMenu('.select', TH.match.field('id', 'a'));
          assert.dom('.select', 'A');
          assert.dom('[type=hidden]', {value: 'a'});
        });
        assert.called(v.onchange);
      },
    },

    "test fillDoc"() {
      let form = Dom.h({form: [
        {button: 'hello', $name: 'foo_id'},
        {input: '', $name: 'bar', $value: 'barVal'},
      ]});

      let doc = {
        constructor: {$fields: {foo_id: 1, bar: 1}},
        foo_id: 'fv',
      };

      Form.fillDoc(doc, form);

      assert.equals(doc.bar, 'barVal');
      assert.equals(doc.foo_id, 'fv');
    },

    "test helper elmId"() {
      var elmId = Dom._helpers.elmId;
      assert.same(elmId.call({_id: 'fooId'}, "bar"), 'bar_fooId');

      assert.same(elmId.call({_id: 'fooId', constructor: {modelName: 'Baz'}}), 'Baz_fooId');
    },

    "test submitFunc"() {
      var top = Dom.h({
        id: "top",
        div: {
          class: 'fields',
          div: [
            {input: '', $name: 'name', $value: 'foo'},
            {input: '', $name: 'age', $value: '12'},
          ],
        }
      });
      document.body.appendChild(top);

      let constructor = {
        $fields: {name: 1, age: 2},
      };

      var ctx = Dom.setCtx(top);
      ctx.data = {
        constructor,
        $save() {
          this._errors = {name: [['bad name']]};
        },
      };

      test.stub(Dom, 'stopEvent');

      var sf = Form.submitFunc('top', v.opts = {
        success: v.success = test.stub(),
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

      v.opts.save = test.stub().returns(true);
      v.opts.success = 'back';

      test.stub(Route.history, 'back');

      sf();

      assert.calledWith(v.opts.save, ctx.data, top.querySelector('.fields'));
      assert.called(Route.history.back);

      v.opts.success = {};
      test.stub(Route, 'replacePath');

      sf();

      assert.calledWith(Route.replacePath, v.opts.success);
    },

    "test helper checked"() {
      var elmStub = {tagName: 'INPUT'};
      test.stub(Dom, 'setClass');
      test.stub(Dom, 'setBoolean');
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
    },

    "modalize": {
      setUp() {
        document.body.appendChild(Dom.html(
          '<div id="top">' +
            '<div class="ta"><input type="text" id="os" value="outside txt"></div>' +
            '<div class="foo"><div class="bar">' +
            '<textarea id="sta">ta</textarea>' +
            '<div id="sce" contenteditable="true">ce</div>' +
            '<button type="button" id="sb" value="notme">' +
            '<input type="password" id="sp" value="hidden">' +
            '<input type="text" id="st" value="txt">' +
            '</div></div></div>'
        ));
        v.func = test.stub();
        Dom.Form.modalize(document.querySelector('.bar'), v.func);
      },

      tearDown() {
        Dom.Form.cancelModalize('all');
      },

      "test addChangeFields"() {
        Dom.TestData = v.Form.TestData;
        test.onEnd(function () {delete Dom.TestData});
        Form.addChangeFields({template: Dom.TestData, fields: ['fooField'], undo: v.onChange = test.stub()});
        document.body.appendChild(Dom.TestData.$autoRender(v.doc = {
          myData: {
            foo: 'x', fooField: 'ff1',
          },
          changes: {changes: 1},
          $asChanges(changes) {
            return {asChanges: changes};
          },

          $save: v.save = test.stub(),

        }));
        v.save.onCall(0).returns(false).onCall(1).returns(true);
        TH.change('[name=fooField]', 'bad');
        refute.called(v.onChange);
        TH.change('[name=fooField]', 'nv');
        assert.calledWith(v.onChange, v.doc, {changes: 1}, {asChanges: {changes: 1}});
      },


      "test mousedown and nesting"() {
        var removeEventListener = test.spy(document, 'removeEventListener');
        TH.trigger('#sp', 'mousedown');

        refute.called(v.func);

        TH.trigger('.foo', 'mousedown');

        assert.calledWith(v.func, TH.match(function (event) {
          assert.same(event.type, 'mousedown');
          assert.same(event.target, document.querySelector('.foo'));
          return true;
        }));

        // testing replacement

        Dom.Form.modalize('.foo', v.func2 = test.stub());

        v.func.reset();

        TH.trigger('#top', 'mousedown');

        refute.called(v.func);
        assert.called(v.func2);

        assert.same(Dom.Form.cancelModalize(), document.querySelector('.bar'));

        refute.called(removeEventListener);

         v.func2.reset();

        TH.trigger('.foo', 'mousedown');

        assert.called(v.func);
        refute.called(v.func2);

        assert.same(Dom.Form.cancelModalize(), null);

        assert.called(removeEventListener);
      },

      "test keydown"() {
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
      },
    },

    "test PlainTextEditor"() {
      document.body.appendChild(Dom.Test.Form.TestPlainTextEditor.$autoRender({name: 'foo\nbar'}));

      assert.dom('#TestPlainTextEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.input.plainText[placeholder="Foo"][data-errorfield="name"]:not([type])', 'foobar', function () {
          assert.same(this.innerHTML, 'foo<br>bar');
          this.innerHTML = 'new<br><b>content</b>';
          assert.same(this.value, 'new\ncontent');
          this.value = "how now";
          assert.same(this.value, 'how now');
        });
      });
    },

    "test RichTextEditor"() {
      Dom.Test.Form.TestRichTextEditor.$helpers({
        testFormMentions() {
          return {
            mentions: {'@': 'testMentions'},
          };
        },
      });
      document.body.appendChild(Dom.Test.Form.TestRichTextEditor.$autoRender({name: Dom.h([{b: 'foo'}, '\nbar'])}));

      assert.dom('#TestRichTextEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.richTextEditor[data-errorfield="name"]:not([type])', function () {
          var data = $.data(this);
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
    },

    "test format"() {
      document.body.appendChild(Dom.Test.Form.TestFormat.$autoRender({foo: 'fuz'}));

      assert.dom('body>div', function () {
        assert.same(this.id, 'FOO_fuz_bar');
      });
    },

    "test passing data arg"() {
      var TestData = v.Form.TestData;

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
    },

    "test renderError"() {
      var form = Dom.html({content: [{name: 'foo'},{name: 'bar'}]});

      Form.renderError(form, 'foo', ['is_required']);
      Form.renderError(form, 'bar', 'bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg>div', 'bar msg');
        assert.dom('[name=foo].error+.errorMsg>div', "can't be blank");

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },

    "test errorTop renderError"() {
      var form = Dom.html({
        style: 'width: 300px;height:100px',
        content: ['hello world', '<br>', {name: 'foo'},
                  {tag: 'input', name: 'bar', style: 'margin-left:200;width:50px;height:20px', class: 'errorTop'}],
      });
      document.body.appendChild(form);

      Form.renderError(form, 'foo', 'foo msg');
      Form.renderError(form, 'bar', v.barMsg = 'big long message bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg.animate', v.barMsg, function () {
          assert.cssNear(this, 'marginLeft', -50, 2);
          assert.cssNear(this, 'marginTop', -16, 2);
          assert.same(this.style.position, 'absolute');
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },

    "test errorRight renderError"() {
      var form = Dom.html({
        style: 'width: 300px;height:100px',
        content: ['hello world', '<br>', {name: 'foo'},
                  {tag: 'input', name: 'bar', style: 'margin-left:200px;width:50px;height:20px', class: 'errorTop errorRight'}],
      });
      document.body.appendChild(form);

      Form.renderError(form, 'foo', 'foo msg');
      Form.renderError(form, 'bar', 'big long message bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg.animate', v.barMsg, function () {
          assert.cssNear(this, 'marginLeft', -162, 15); // firefox is 172; chrome is 152 both display correctly?
          assert.cssNear(this, 'marginTop', -16, 2);
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },
  });
});
