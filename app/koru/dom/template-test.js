isClient && define(function (require, exports, module) {
  /**
   * DomTemplate is used to create interactive
   * [Dom Trees](https://developer.mozilla.org/en-US/docs/Web/API/Node)
   **/
  'use strict';
  var test, v;
  const Dom         = require('koru/dom');
  const Ctx         = require('koru/dom/ctx');
  const TH          = require('koru/test');
  const api         = require('koru/test/api');
  const util        = require('koru/util');
  const DomTemplate = require('./template');

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
      delete Dom.Foo;
      Dom.removeChildren(document.body);
    },

    "test stopEvent"() {
      var ev = {stopImmediatePropagation: test.stub(), preventDefault: test.stub()};
      Dom.stopEvent(ev);
      assert.called(ev.stopImmediatePropagation);
      assert.called(ev.preventDefault);
      var Tpl = Dom.newTemplate({
        name: "Foo",
        nodes:[{
          name:"div",
        }],
      });

      Tpl.$events({
        'click': function (event) {
          assert.same(Dom.event, event);
          Dom.stopEvent(event);
          refute.called(event.stopImmediatePropagation);
          refute.called(event.preventDefault);
          assert.same(Dom.event, null);
          v.success = true;
        },

        'keydown': function (event) {
          assert.same(Dom.event, event);
          Dom.stopEvent();
          refute.called(event.stopImmediatePropagation);
          refute.called(event.preventDefault);
          assert.same(Dom.event, null);
          v.success = true;
        },
      });

      document.body.appendChild(Tpl.$autoRender({}));
      assert.dom('div', function () {
        var ev = Dom.buildEvent('click');
        test.stub(ev, 'stopImmediatePropagation');
        test.stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);

        v.success = false;

        var ev = Dom.buildEvent('keydown');
        test.stub(ev, 'stopImmediatePropagation');
        test.stub(ev, 'preventDefault');
        this.dispatchEvent(ev);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert(v.success);
      });
    },

    "test relative name"() {
      Dom.newTemplate({
        name: "Bar.Baz.Buzz",
        nodes:[{
          name:"div",
          children: [' ', ['>', '../../Fnord.Sub.Sub', ['=', 'x', 123]]],
        }],
      });

      Dom.newTemplate({
        name: "Bar.Fnord.Sub.Sub",
        nodes: [{
          name: 'div',
          children: ["hello Fnord"],
        }],
      });

      assert.dom(Dom.Bar.Baz.Buzz.$render({}), function () {
        assert.dom('div', 'hello Fnord');
      });
    },

    "partial": {
      setUp () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            attrs: [["=","id","FooId"]],
            children:[' ', ['>', '/Bar']],
          }],
        });

        Dom.newTemplate({
          name: "Bar",
          nodes:[{
            name:"div",
            children:[' ', ['>', 'Baz', ['=', 'initials', 'myFunc']]],
          }],
        });

        Dom.newTemplate({
          name: "Bar.Baz",
          nodes:[{
            name:"input",
            attrs:[["=","type",'text'], ["=", 'value', ['', 'initials']]],
            children: [{
              name: 'article',
              attrs: [['=', 'id', 'BazArticle']],
            }],
          }],
        });
      },

      tearDown () {
        Dom.removeChildren(document.body);
        delete Dom.Bar;
      },

      "test setCtx"() {
        var elm = Dom.Foo.$render({});
        assert.dom(elm, function () {
          v.pCtx = Dom.getMyCtx(this);
          this.appendChild(Dom.h({class: 'ins'}));
          assert.dom('.ins', function () {
            v.iCtx = Dom.setCtx(this);
            assert.same(v.iCtx.parentCtx, v.pCtx);
            assert.same(Dom.getMyCtx(this), v.iCtx);
            v.nCtx = Dom.setCtx(this, new Dom.Ctx());
            assert.same(v.nCtx.parentCtx, undefined);
            assert.same(Dom.getMyCtx(this), v.nCtx);
          });
        });
      },

      "test find ctx"() {
        Dom.Bar.$helpers({
          myFunc: function () {
            v.helperFoundCtx = Dom.Foo.$ctx();

            return 'one';
          },
        });
        var elm = Dom.Foo.$render({});

        assert.same(v.helperFoundCtx, elm._koru);

        assert.dom(elm, function () {
          assert.dom('input', {value: 'one'}, function () {
            var ctx = Dom.Foo.$ctx(this);
            assert.same(ctx, elm._koru);
            assert.same(ctx.element(), elm);
          });
        });

        document.body.appendChild(elm);

        assert.dom('#FooId');
        assert.same(Dom.Foo.$ctx('FooId'), elm._koru);
        assert.same(Dom.Foo.$data('FooId'), elm._koru.data);
        assert.same(Dom.Foo.$data(elm.querySelector('#BazArticle')), elm._koru.data);

        assert.same(Dom.getCtxById('FooId'), elm._koru);
      },

      "test updateAllTags"() {
        var elm = Dom.Foo.$render({myFunc: 'one'});

        document.body.appendChild(elm);

        assert.dom(elm, function () {
          assert.dom('input', {value: 'one'});

          elm._koru.updateAllTags({myFunc: 'two'});

          assert.dom('input', {count: 1});
          assert.dom('input', {value: 'two'}, function () {
            this._koru.updateAllTags(null);

            assert.same(this.textContent, '');

            assert.same(this._koru.data, null);
          });
        });
      },

      "test restoring focus"() {
        Dom.Bar.$helpers({
          myFunc: function () {
            v.helperFoundCtx = Dom.Foo.$ctx();

            document.activeElement.blur(); // same effect as moving the focused element
            return 'foo';
          },
        });
        var elm = Dom.Foo.$render({});

        document.body.appendChild(elm);

        assert.dom(elm, function () {
          assert.dom('input', function () {
            this.focus();
            assert.same(document.activeElement, this);
          });

          elm._koru.updateAllTags();

          assert.dom('input', function () {
            assert.same(document.activeElement, this);

            this._koru.updateAllTags(null);

            assert.same(this.textContent, '');

            assert.same(this._koru.data, null);
          });
        });
      },

      "test default arg is data"() {
        Dom.Bar.$created = test.stub();

        var data = {arg: 'me'};
        Dom.Foo.$render(data);

        assert.calledWith(Dom.Bar.$created, TH.match(function (ctx) {
          assert.same(ctx.data, data);
          return true;
        }));
      },

      "test scoping"() {
        var initials = 'BJ';
        Dom.Bar.$helpers({
          myFunc: function () {
            return initials;
          },
        });
        var result = Dom.Foo.$render({});

        assert.dom(result, function () {
          assert.dom('>div>input', {value: 'BJ'});
        });
      },
    },

    "test $actions"() {
      Dom.newTemplate({name: "Foo"});
      Dom.Foo.$actions({
        one: v.one = test.stub(),
        two: test.stub(),
      });

      assert.same(Dom.Foo._events.length, 2);
      assert.same(Dom.Foo._events[0][0], 'click');
      assert.same(Dom.Foo._events[0][1], '[name=one]');

      var event = {};

      Dom.Foo._events[0][2](event);

      assert.calledWithExactly(v.one, event);
    },

    "test event calling"() {
      Dom.newTemplate({name: 'Foo', nodes: [{
        name: 'div', children: [
          {name: 'span'},
          {name: 'button'},
        ]
      }]});
      v.spanCall = test.stub();
      Dom.Foo.$events({
        'click div': v.divCall = test.stub(),

        'click span': function (event) {
          v.spanCall();
          v.stop && Dom[v.stop].call(Dom);
        },
      });
      Dom.Foo.$event('click button', v.buttonCall = test.stub());

      document.body.appendChild(Dom.Foo.$render({}));

      assert.dom('body>div', function () {
        var top = this;
        test.onEnd(function () {Dom.remove(top)});
        test.spy(top, 'addEventListener');
        Dom.Foo.$attachEvents(top);
        assert.calledOnce(top.addEventListener);
        Dom.getCtx(top).onDestroy(function () {
          Dom.Foo.$detachEvents(top);
        });
        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = test.stub(),
            preventDefault: v.pd = test.stub(),
          });
        });
        assert.called(v.spanCall);
        assert.called(v.divCall);
        refute.called(v.sip);
        refute.called(v.pd);

        // stopEvent
        v.spanCall.reset(); v.divCall.reset();
        v.stop = 'stopEvent';

        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = test.stub(),
            preventDefault: v.pd = test.stub(),
          });
        });
        assert.called(v.spanCall);
        refute.called(v.divCall);
        assert.called(v.sip);
        assert.called(v.pd);

        // stopPropigation
        v.spanCall.reset(); v.divCall.reset();
        v.stop = 'stopPropigation';

        assert.dom('span', function () {
          top.addEventListener.yield({
            currentTarget: top, target: this, type: 'click',
            stopImmediatePropagation: v.sip = test.stub(),
            preventDefault: v.pd = test.stub(),
          });
        });
        assert.called(v.spanCall);
        refute.called(v.divCall);
        assert.called(v.sip);
        refute.called(v.pd);

        Dom.Foo.$detachEvents(top);
        Dom.remove(top);
        Dom.Foo.$detachEvents(top);

      });
    },

    "newTemplate": {
      setUp() {
      },

      "test simple"() {
        /**
         * Create a new `DomTemplate` from an html blueprint.
         *
         * @param [module] if supplied the template will be deleted if
         * `module` is unloaded
         *
         * @param blueprint A blue print is usually built by
         * {#koru/dom/template-compiler} which is called automatically
         * on html files loaded using
         * `require('koru/html!path/to/my-template.html')`
         **/
        api.method('newTemplate');
        const myMod = {id: 'myMod', onUnload: test.stub(),
                       __proto__: module.constructor.prototype};
        assert.same(DomTemplate.newTemplate(myMod, {
          name: "Foo", nodes: [{name: "div"}]
        }), Dom.Foo);

        const tpl = Dom.Foo;
        assert.same(tpl.name, "Foo");
        assert.equals(tpl.nodes, [{name: "div"}]);
        assert.equals(tpl._helpers, null);
        assert.equals(tpl._events, []);

        myMod.onUnload.yield();
        refute(Dom.Foo);
      },

      "test not found"() {
        var tp = Dom.newTemplate({name: "Foo.Bar.Baz"});
        assert.same(Dom.lookupTemplate('Foo.Fizz.Bar'), undefined);
      },

      "test nest by name"() {
        var fbb = Dom.newTemplate({name: "Foo.Bar.Baz"});
        var fff = Dom.newTemplate({name: "Foo.Fnord.Fuzz"});

        assert.same(fbb, Dom.lookupTemplate("Foo.Bar.Baz"));
        assert.same(fbb, Dom.lookupTemplate.call(Dom.lookupTemplate("Foo"), "Bar.Baz"));
        assert.same(fff, Dom.lookupTemplate.call(fbb, "../../Fnord.Fuzz"));

        var tpl = Dom.Foo.Bar;
        assert.same(tpl.name, 'Bar');
        assert.same(tpl._helpers, undefined);
        assert.same(Dom.lookupTemplate("Foo.Bar"), tpl);


        assert.same(tpl.Baz.name, 'Baz');

        Dom.newTemplate({name: "Foo"});

        assert.same(Dom.Foo.name, 'Foo');
        assert.same(Dom.Foo.Bar.Baz.name, 'Baz');

        Dom.newTemplate({name: "Foo.Bar"});

        assert.same(Dom.Foo.Bar.name, 'Bar');
        assert.equals(tpl._helpers, null);
        assert.same(Dom.Foo.Bar.Baz.name, 'Baz');
      },
    },

    "with template": {
      setUp () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div", attrs:[["=","id",'foo'], ["", 'myHelper']],}],
        });
      },

      "test $created"() {
        var pCtx = {foo: 'bar'};
        Dom.Foo.$extend({
          $created: function (ctx, elm) {
            v.ctx = ctx;
            assert.same(ctx.parentCtx, pCtx);

            v.elm = elm;
            ctx.data = {myHelper: v.myHelper = test.stub()};
          },
        });

        assert.dom(Dom.Foo.$render({}, pCtx), function () {
          assert.called(v.myHelper);
          assert.same(v.elm, this);
          assert.same(v.ctx, Dom.getCtx(this));
        });
      },

      "test setBoolean"() {
        assert.exception(function () {
          Dom.setBoolean('disabled', true);
        });

        assert.dom(document.createElement('div'), function () {
          Dom.setBoolean('checked', true, this);
          assert.same(this.getAttribute('checked'), 'checked');
          Dom.setBoolean('checked', false, this);
          assert.same(this.getAttribute('checked'), null);
        });

        Dom.Foo.$helpers({
          myHelper: function () {
            Dom.setBoolean('disabled', this.on);
          },
        });

        assert.dom(Dom.Foo.$render({on: true}), function () {
          assert.same(this.getAttribute('disabled'), 'disabled');

          Dom.getCtx(this).updateAllTags({on: false});

          assert.same(this.getAttribute('disabled'), null);
        });
      },

      "with rendered": {
        setUp () {

          v.foo = Dom.Foo.$render();

          document.body.appendChild(v.foo);
        },

        "test focus"() {
          document.body.appendChild(Dom.html('<form><button name="bt"><input type="text" name="inp"><button name="b2"></form>'));
          assert.dom('form', function () {
            assert.dom('[name=b2]', function () {
              this.focus();
              assert.same(document.activeElement, this);
            });
            Dom.focus(this);
            assert.dom('[name=inp]', function () {
              assert.same(document.activeElement, this);
            });
            Dom.focus(this, '[name=bt]');
            assert.dom('[name=bt]', function () {
              assert.same(document.activeElement, this);
            });
          });
        },

        "test replace element"() {
          Dom.newTemplate({name: 'Foo.Bar', nodes: [{name: 'span'}]});
          Dom.newTemplate({name: 'Foo.Baz', nodes: [{name: 'h1'}]});

          var dStub = Dom.Foo.Bar.$destroyed = function () {
            if (v) v.args = arguments;
          };

          var bar = Dom.Foo.Bar.$render();
          var baz = Dom.Foo.Baz.$render();

          v.foo.appendChild(bar);

          assert.dom('#foo', function () {
            assert.dom('>span', function () {
              v.barCtx = this._koru;
            });
            Dom.replaceElement(baz, bar);
            var ctx = this._koru;
            assert.dom('>h1', function () {
              assert.same(ctx, this._koru.parentCtx);
            });
            refute.dom('>span');
            assert.same(v.args[0], v.barCtx);
            assert.isNull(bar._koru);

            bar = Dom.Foo.Bar.$render();

            Dom.replaceElement(bar, baz, 'noRemove');

            assert.dom('>span', function () {
              assert.same(ctx, this._koru.parentCtx);
            });
            refute.dom('>h1');
            assert.same(v.args[0], v.barCtx);
            refute.isNull(baz._koru);
          });
        },
      },
    },

    "test rendering fragment"() {
      DomTemplate.newTemplate({
        name: "Foo",
        nodes: [{
          name:"div",
          attrs: [["=","id","div1"]],
          children: [" ",["","bar"]," "]
        }, {
          name:"div",
          attrs: [["=","id","div2"]],
        }],
      });

      var frag = Dom.Foo.$render({});

      assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);
      assert(frag._koru);
    },

    "test inserting Document Fragment"() {
      DomTemplate.newTemplate({
        name: "Foo",
        nodes: [{
          name:"div",
          attrs:[],
          children: [" ",["","bar"]," "],
        }],
      });

      Dom.Foo.$helpers({
        bar: function () {
          return content.apply(this, arguments);
        },
      });

      var content = function () {
        var frag = document.createDocumentFragment();
        frag.appendChild(Dom.html('<div id="e1">e1</div>'));
        frag.appendChild(Dom.html('<div id="e2">e2</div>'));
        frag.appendChild(Dom.html('<div id="e3">e3</div>'));
        return frag;
      };

      var elm = Dom.Foo.$render({});
      assert.dom(elm, function () {
        assert.dom('div', {count: 3});
      });

      content = function () {
        var frag = document.createDocumentFragment();
        frag.appendChild(Dom.html('<p id="n1">n1</p>'));
        frag.appendChild(Dom.html('<p id="n2">n2</p>'));
        return frag;
      };

      Dom.getCtx(elm).updateAllTags();
      assert.dom(elm, function () {
        refute.dom('div');
        assert.dom('p', {count: 2});
      });

      content = function () {
        var elm = document.createElement('span');
        elm.textContent = 'foo';
        return elm;
      };

      Dom.getCtx(elm).updateAllTags();
      assert.dom(elm, function () {
        refute.dom('p');
        assert.dom('span', 'foo', function () {
          assert.same(this.nextSibling.nodeType, document.TEXT_NODE);
        });
      });
    },

    "$render": {
      "test autostop"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div"}],
        });

        var elm = Dom.Foo.$render({});
        var ctx = Dom.getCtx(elm);
        var stub1 = test.stub();
        var stub2 = test.stub();
        ctx.onDestroy({stop: stub1})
          .onDestroy(stub2);

        Dom.remove(elm);

        assert.called(stub1);
        assert.called(stub2);

        stub1.reset();
        Dom.remove(elm);

        refute.called(stub1);
      },

      "test cleanup on exception"() {
        Dom.newTemplate({
          name: "Foo",
          nodes: [{
            name:"div",
            children: [" ",["","bar"]," "],
          }],
        });

        Dom.Foo.$helpers({
          bar: function () {
            throw new Error('bang');
          },
        });

        test.spy(Dom, 'destroyData');

        assert.exception(function () {
          Dom.Foo.$render({});
        }, 'Error', 'while rendering: Foo\nbang');

        assert.calledWith(Dom.destroyData, TH.match(function (elm) {
          return elm.tagName === 'DIV';
        }));
      },

      "destroyMeWith": {
        setUp () {
          v.elm = Dom.h({div: "subject"});
          v.elmCtx = Dom.setCtx(v.elm);

          v.dep = Dom.h({div: "dep"});
          v.depCtx = Dom.setCtx(v.dep);

          document.body.appendChild(v.elm);
          document.body.appendChild(v.dep);
          Dom.destroyMeWith(v.dep, v.elm);

          v.dep2 = Dom.h({div: "dep2"});
          v.dep2Ctx = Dom.setCtx(v.dep2);

          document.body.appendChild(v.dep2);
          Dom.destroyMeWith(v.dep2, v.elm);
        },

        "test removes with"() {
          Dom.remove(v.elm);
          assert.same(v.elm._koru, null);
          assert.same(v.dep._koru, null);
          assert.same(v.dep.parentNode, null);
          assert.same(v.dep2._koru, null);
          assert.same(v.dep2.parentNode, null);
        },

        "test detaches if removed"() {
          Dom.remove(v.dep);
          var obs = {};
          assert(v.dep2Ctx.__id);
          obs[v.dep2Ctx.__id] = v.dep2;
          assert.equals(v.elm._koru.__destoryObservers, obs);

          Dom.remove(v.dep2);
          assert.same(v.elm._koru.__destoryObservers, null);
        },
      },

      "test no frag if only one child node"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div"}],
        });

        var elm = Dom.Foo.$render({});
        assert.same(elm.nodeType, document.ELEMENT_NODE);
        assert.same(elm.tagName, 'DIV');
      },

      "test frag if multi childs"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div",}, {name: 'span'}, {name: 'section'}],
        });
        var frag = Dom.Foo.$render({});
        assert.same(frag.nodeType, document.DOCUMENT_FRAGMENT_NODE);

        var ctx = frag.firstChild._koru;
        assert.same(frag.firstChild.tagName, 'DIV');

        assert.same(ctx, frag.firstChild.nextSibling._koru);
        assert.same(ctx, frag.lastChild._koru);
      },


      "test attributes"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",attrs:[
              ["=","id",["","id"]],
              ["=","class",["","classes"]],
              ["=","data-id",["","user._id"]],
              ["","draggable"]
            ],
            children:[],
          }],
        });

        Dom.Foo.$helpers({
          classes: function () {
            return "the classes";
          },

          draggable: function () {
            Dom.current.element.setAttribute('draggable', 'true');
          },
        });

        assert.dom(Dom.Foo.$render({id: 'foo', user: {_id: '123'}}), function () {
          assert.same(this.getAttribute('id'), 'foo');
          assert.same(this.getAttribute('class'), 'the classes');
          assert.same(this.getAttribute('data-id'), '123');

          assert.same(this.getAttribute('draggable'), 'true');
        });
      },

      "test parent"() {
        Dom.newTemplate({
          name: "Foo.Bar",
          nested: [{
            name: "Baz",
          }],
        });

        assert.same(null, Dom.Foo.parent);
        assert.same(Dom.Foo, Dom.Foo.Bar.parent);
        assert.same(Dom.Foo.Bar, Dom.Foo.Bar.Baz.parent);
        assert.same(Dom.Foo.Bar.$fullname, 'Foo.Bar');

        assert.isTrue(Dom.Foo.$contains(Dom.Foo));
        assert.isTrue(Dom.Foo.$contains(Dom.Foo.Bar.Baz));
        assert.isFalse(Dom.Foo.Bar.$contains(Dom.Foo));
      },

      "test updateElement"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[{
              name:"h1",
              attrs:[['', 'foo', '.user.nameFunc']],
              children:[['', 'user.name']]
            },{
              name:"label",
              attrs:[["=", "class", "search"]],
              children:[['', 'user.initials']],
            }]
          }, {
            name: "h2",
            children:[['', 'user.name']],
          }],
        });

        Dom.Foo.$helpers({
          foo: function (arg) {
            Dom.current.element.setAttribute('data-foo', arg);
          },
        });

        var elm = Dom.Foo.$render(v.data = {user: {initial: 'fb', name: 'Foo', nameFunc: function () {
          return this.name;
        }}});
        document.body.appendChild(elm);

        assert.dom('h1', 'Foo', function () {
          assert.msg('should set this correctly when calling nested function')
            .same(this.getAttribute('data-foo'), 'Foo');

          v.data.user.name = 'Bar';
          Dom.getCtx(elm).updateElement(this);
          assert.dom(this, 'Bar');
        });
      },

      "test updateElement 2"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[['', 'name'], {
              name:"p",
              children:[['', 'name']],
            }],
          }],
        });

        var data = {name: 'foo'};

        assert.dom(Dom.Foo.$render(data), function () {
          assert.dom('p', 'foo', function () {
            data.name = 'bar';
            Dom.updateElement(this);
            assert.same(this.textContent, 'bar');
          });
          assert.same(this.textContent, 'foobar');
        });
      },

      "test body"() {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"div",
            children:[['', 'user.initials']],
          }],
        });

        assert.dom(Dom.Foo.$render({user: {initials: 'fb'}}), 'fb');
      },
    },

    "test registerHelpers"() {
      const Foo = Dom.newTemplate({
        name: "Foo.Super",
        nodes:[],
      });

      Foo.$helpers({
        _test_name() {
          return this.name.toUpperCase();
        },
      });

      Dom.registerHelpers({
        _test_name() {return "global name"},
        _test_age() {return "global age"},
      });

      test.onEnd(function () {
        Dom._helpers._test_name = null;
        Dom._helpers._test_age = null;
      });

      const data = {name: 'sally'};

      assert.same(Foo._helpers._test_name.call(data), "SALLY");
      assert.same(Foo._helpers._test_age.call(data), "global age");
      assert.same(Dom._helpers._test_name.call(data), "global name");
    },

    "test extends"() {
      const Super = Dom.newTemplate({
        name: "Foo.Super",
      });

      Dom.newTemplate({
        name: "Foo.Super.Duper"
      });

      Super.$helpers({
        superFoo() {
          return this.name.toUpperCase();
        },
      });

      Super.$extend({
        fuz() {
          return "fuz";
        },
      });

      const Sub = Dom.newTemplate({
        name: "Foo.Sub",
        extends: "../Foo.Super", // test lookup works
        nodes:[{
          name:"div",
          children:[['', 'superFoo']],
        }],
        nested: [{
          name: "Duper"
        }]
      });

      assert.same(Sub.Duper.parent, Sub);

      assert.same(Sub.fuz(), "fuz");
      assert.dom(Sub.$render({name: 'susan'}), 'SUSAN');
    },

    "test inputValue helper"() {
      var elm = Ctx._private.currentElement = {};
      TH.stubProperty(elm, 'value', {get: function () {return '34'}, set: v.stub = test.stub()});
      Dom._helpers.inputValue('foo');

      assert.same(elm.__koruOrigValue__, 'foo');

      assert.calledWith(v.stub, 'foo');

      Dom._helpers.inputValue();

      assert.calledWith(v.stub, '');

      v.stub.reset();
      Dom._helpers.inputValue(34);

      refute.called(v.stub);
    },
 });
});
