isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Dom = require('../dom');
  var Form = require('./form');
  var formTpl = require('../html!./form-test');
  var util = require('../util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.Form = Dom.newTemplate(util.deepCopy(formTpl));
      v.selectList = v.Form.TestSelect;
    },

    tearDown: function () {
      Dom.removeChildren(document.body);
      delete Dom.Test;
      v = null;
    },

    "test helper elmId": function () {
      var elmId = Dom._helpers.elmId;
      assert.same(elmId.call({_id: 'fooId'}, "bar"), 'bar_fooId');

      assert.same(elmId.call({_id: 'fooId', constructor: {modelName: 'Baz'}}), 'Baz_fooId');
    },

    "test helper checked": function () {
      var elmStub = {tagName: 'INPUT'};
      test.stub(Dom, 'setClass');
      test.stub(Dom, 'setBoolean');
      TH.stubProperty(Dom.current, 'element', {get: function () {return elmStub}});
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
      setUp: function () {
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

      tearDown: function () {
        Dom.Form.cancelModalize('all');
      },

      "test addChangeFields": function () {
        Dom.TestData = v.Form.TestData;
        test.onEnd(function () {delete Dom.TestData});
        Form.addChangeFields({template: Dom.TestData, fields: ['fooField'], undo: v.onChange = test.stub()});
        document.body.appendChild(Dom.TestData.$autoRender(v.doc = {
          myData: {
            foo: 'x', fooField: 'ff1',
          },
          changes: {changes: 1},
          $asChanges: function (changes) {
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


      "test mousedown and nesting": function () {
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

      "test keyup": function () {
        TH.trigger('#sp', 'keyup', {which: 26});
        TH.trigger('.foo', 'keyup', {which: 26});
        TH.trigger('#st', 'keyup', {which: 27});
        TH.trigger('#sta', 'keyup', {which: 27});
        TH.trigger('#sce', 'keyup', {which: 27});
        TH.trigger('#sp', 'keyup', {which: 27});

        refute.called(v.func);

        TH.trigger('.foo', 'keyup', {which: 27});
        TH.trigger('#sb', 'keyup', {which: 27});
        TH.trigger('#os', 'keyup', {which: 27});

        assert.calledWith(v.func, TH.match(function (event) {
          assert.same(event.type, 'keyup');
          return event.target === document.querySelector('.foo');
        }));

        assert.same(v.func.callCount, 3);
      },
    },

    "test empty MarkdownEditor": function() {
      document.body.appendChild(Dom.Test.Form.TestMarkdownEditor.$autoRender({}));

      assert.dom('#TestMarkdownEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.mdEditor.bar[data-errorfield="name"]:not([type])>.input');
      });
    },

    "test PlainTextEditor": function () {
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

    "test RichTextEditor": function () {
      document.body.appendChild(Dom.Test.Form.TestRichTextEditor.$autoRender({name: Dom.h([{b: 'foo'}, '\nbar'])}));

      assert.dom('#TestRichTextEditor>label', function () {
        assert.dom('span.name', 'Name');
        assert.dom('#nameId.richTextEditor[data-errorfield="name"][placeholder="Foo"]:not([type])', function () {
          assert.dom('.rtToolbar');
          assert.dom('>.input', 'foobar', function () {
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

    "test format": function () {
      document.body.appendChild(Dom.Test.Form.TestFormat.$autoRender({foo: 'fuz'}));

      assert.dom('body>div', function () {
        assert.same(this.id, 'FOO_fuz_bar');
      });
    },

    "test passing data arg": function () {
      var TestData = v.Form.TestData;

      TestData.$helpers({
        myData: function () {
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

    "SelectList": {
      setUp: function () {
        v.list = [["1", "item 1"], ["2", "item 2"]];
        v.doc = {
          foo_id: "2",
        };
      },

      "test with Array": function () {
        v.selectList.$helpers({fooList: function () {return v.list}});

        document.body.appendChild(v.selectList.$autoRender(v.doc));

        assert.dom("label", function () {
          assert.dom('select#fooId[name=foo_id]', function () {
            assert.domParent('.name', 'Foo');
            assert.dom('option', {value: "1", text: "item 1"});
            assert.dom('option[selected]', {value: "2", text: "item 2"});
          });
        });
      },

      "test radio with Array": function () {
        v.selectList = Dom.Test.Form.TestRadio;
        v.selectList.$helpers({fooList: function () {return v.list}});

        document.body.appendChild(v.selectList.$autoRender(v.doc));

        assert.dom("label", function () {
          assert.dom('span#fooId[data-errorField=foo_id].errorField.radioGroup', function () {
            assert.domParent('.name', 'Foo');
            assert.dom('label>input[type=radio][value="1"]+span', {text: "item 1"});
            assert.dom('[type=radio][checked]', {value: "2"});
          });
        });
      },

      "test with object": function () {
        v.selectList.$helpers({
          fooList: function () {
            return [{_id: "1", name: "item 1"}, {_id: "2", name: "item 2"}];
          },
        });

        document.body.appendChild(v.selectList.$autoRender(v.doc));

        assert.dom("label", function () {
          assert.dom('select#fooId[name=foo_id]', function () {
            assert.domParent('.name', 'Foo');
            assert.dom('option', {value: "1", text: "item 1"});
            assert.dom('option[selected]', {value: "2", text: "item 2"});
          });
        });
      },

      "includeBlank": {
        setUp: function () {
          v.call = function (arg) {
            v.elm = Dom.Form.Select.$autoRender({
              name: 'foo_id',
              doc: v.doc,
              options: {
                includeBlank: arg,
                selectList: v.list,
              }
            });
          };
        },

        "test msg": function () {
          v.call('hello world');

          assert.dom(v.elm, function () {
            assert.dom('option:first-child', {value: '', text: 'hello world'});
          });
        },

        "test 'true'": function () {
          v.call('true');

          assert.dom(v.elm, function () {
            assert.dom('option:first-child', {value: '', text: ''});
          });
        },

        "test empty": function () {
          v.call('');
          assert.dom(v.elm, function () {
            assert.dom('option:first-child', {value: '', text: ''});
          });
        },
      },
    },

    "test renderError": function () {
      var form = Dom.html({content: [{name: 'foo'},{name: 'bar'}]});

      Form.renderError(form, 'foo', 'foo msg');
      Form.renderError(form, 'bar', 'bar msg');

      assert.dom(form, function () {
        assert.dom('[name=bar].error+.errorMsg>div', 'bar msg');
        assert.dom('[name=foo].error+.errorMsg>div', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },

    "test errorTop renderError": function () {
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
          assert.cssNear(this, 'marginTop', -20, 2);
          assert.cssNear(this, 'height', 20, 2);
          assert.same(this.style.position, 'absolute');
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },

    "test errorRight renderError": function () {
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
          assert.cssNear(this, 'marginTop', -20, 2);
        });
        assert.dom('[name=foo].error+.errorMsg', 'foo msg');

        Form.renderError(form, 'bar', false);

        assert.dom('[name=bar]:not(.error)+.errorMsg', '');
      });
    },
  });
});
