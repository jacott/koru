isClient && define(['module', 'koru/test/sinon', 'koru/test', './dom'], function (module, sinon, geddon, Dom) {
  var test, v;

  geddon.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
    },

    tearDown: function () {
      v = null;
      delete Dom.Foo;
      Dom.removeChildren(document.body);
    },

    "evalArgs": {
      "test constant": function () {
        assert.equals(_private.evalArgs({}, ['"name', ['=', 'type', '"text'], ['=', 'count', '"5']]), ['name', {type: 'text', count: '5'}]);
      },
    },

    "partial": {
      setUp: function () {
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
            attrs:[["=","type",'text'], ["=", 'value', ['', 'initials']]]
          }],
        });
      },

      tearDown: function () {
        Dom.removeChildren(document.body);
        delete Dom.Bar;
      },

      "test find ctx": function () {
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

        assert.same(Dom.getCtxById('FooId'), elm._koru);
      },

      "test updateAllTags": function () {
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

      "test restoring focus": function () {
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

      "test default arg is data": function () {
        Dom.Bar.$created = test.stub();

        var data = {arg: 'me'};
        Dom.Foo.$render(data);

        assert.calledWith(Dom.Bar.$created, sinon.match(function (ctx) {
          assert.same(ctx.data, data);
          return true;
        }));
      },

      "test scoping": function () {
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

    "Dom.current": {
      "test data": function () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{
            name:"section",
            children:[['', "testMe"]],
          }],
        });
        Dom.Foo.$helpers({
          testMe: function () {
            assert.same(this, Dom.current.data());
            assert.same(this, v.x);
            assert.same(Dom.current.ctx, Dom.getCtx(Dom.current.element));

            v.data = Dom.current.data(v.elm);

            return v.elm;
          },
        });

        var data = {me: true};

        v.elm = Dom.html({});
        v.elm._koru = {data: data};

        var foo = Dom.Foo.$render(v.x = {x: 1});

        assert.same(v.data, data);
      },
    },

    "test html": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      document.body.appendChild(elm);

      document.body.appendChild(Dom.html({"class": 'bar', id: "s123", tag: 'section', span: {text: "Goodbye"}}));

      assert.dom('#top', function () {
        assert.same(elm, this);

        assert.dom('>.foo', function () { // doubles as a test for assert.dom directChild
          assert.dom('>.bar>button#sp', 'Hello');
        });
      });

      assert.dom('body', function () {
        assert.dom('section#s123.bar', 'Goodbye', function () {
          assert.dom('span', 'Goodbye');
        });
      });
    },

    "test escapeHTML": function () {
      assert.same(Dom.escapeHTML('<Testing>&nbsp;'), '&lt;Testing&gt;&amp;nbsp;');
    },

    "test setClassBySuffix": function () {
      var elm = {className: ''};

      Dom.setClassBySuffix('use', 'Mode', elm);
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('design', 'Mode', elm);
      assert.same(elm.className, 'designMode');

      Dom.setClassBySuffix('discard', 'Avatar', elm);
      assert.same(elm.className, 'designMode discardAvatar');

      _private.currentElement = elm;

      Dom.setClassBySuffix('use', 'Mode');
      assert.same(elm.className, 'discardAvatar useMode');

      Dom.setClassBySuffix(null, 'Avatar');
      assert.same(elm.className, 'useMode');

      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      Dom.setClassBySuffix('devMode prod', 'Mode', elm);
      assert.same(elm.className, 'devMode prodMode');

      Dom.setClassBySuffix('', 'Mode', elm);
      assert.same(elm.className, '');
    },

    "test setClassByPrefix": function () {
      var elm = {className: ''};

      Dom.setClassByPrefix('use', 'mode-', elm);
      assert.same(elm.className, 'mode-use');

      Dom.setClassByPrefix('design', 'mode-', elm);
      assert.same(elm.className, 'mode-design');

      _private.currentElement = elm;

      Dom.setClassByPrefix('discard', 'avatar-');
      assert.same(elm.className, 'mode-design avatar-discard');

      Dom.setClassByPrefix('use', 'mode-');
      assert.same(elm.className, 'avatar-discard mode-use');

      Dom.setClassByPrefix(null, 'avatar-');
      assert.same(elm.className, 'mode-use');
      Dom.setClassByPrefix('dev mode-prod', 'mode-');
      assert.same(elm.className, 'mode-dev mode-prod');

      Dom.setClassByPrefix('', 'mode-', elm);
      assert.same(elm.className, '');
    },

    "test classList": function () {
      var elm = document.createElement('div');

      refute(Dom.hasClass(null, 'foo'));
      refute(Dom.hasClass(elm, 'foo'));

      Dom.addClass(elm, 'foo');
      assert(Dom.hasClass(elm, 'foo'));

      Dom.addClass(null, 'foo');
      Dom.addClass(elm, 'foo');
      Dom.addClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      assert(Dom.hasClass(elm, 'bar'));

      Dom.removeClass(null, 'bar');
      Dom.removeClass(elm, 'bar');
      assert(Dom.hasClass(elm, 'foo'));
      refute(Dom.hasClass(elm, 'bar'));

      // test toggle
      assert(Dom.toggleClass(elm, 'bar'));
      assert(Dom.hasClass(elm, 'bar'));

      refute(Dom.toggleClass(elm, 'bar'));
      refute(Dom.hasClass(elm, 'bar'));
    },

    "test parentOf": function () {
      var elm = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      assert.same(Dom.parentOf(elm, elm.querySelector('.bar')), elm);
      assert.same(Dom.parentOf(elm.querySelector('.bar'), elm), null);
    },

    "test searchUpFor": function () {
      var top = Dom.html('<div id="top"><div class="foo"><div class="bar"><button type="button" id="sp">Hello</button></div></div></div>');

      assert.isNull(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return elm === top;
      }, 'bar'));
      assert.same(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return Dom.hasClass(elm, 'bar');
      }, 'bar'), top.firstChild.firstChild);

      assert.same(Dom.searchUpFor(top.querySelector('button').firstChild, function (elm) {
        return Dom.hasClass(elm, 'bar');
      }), top.firstChild.firstChild);
    },

    "test $getClosest": function () {
      document.body.appendChild(Dom.html('<div><div class="foo"><div class="bar"><button type="button" id="sp"></button></div></div></div>'));

      var button = document.getElementById('sp');

      var foobar = document.querySelector('.foo>.bar');

      test.stub(Dom, 'getCtx').withArgs(foobar).returns('the ctx');

      assert.same(Dom.getClosest(button, '.foo>.bar'), foobar);
      assert.same(Dom.getClosestCtx(button, '.foo>.bar'), 'the ctx');
    },

    "test $actions": function () {
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

    "test event calling": function () {
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

        'click button': v.buttonCall = test.stub(),
      });

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
      });
    },

    "newTemplate": {
      "test simple": function () {
        assert.same(Dom.newTemplate({name: "Foo", nodes: "nodes"}), Dom.Foo);

        var tpl = Dom.Foo;
        assert.same(tpl.name, "Foo");
        assert.same(tpl.nodes, "nodes");
        assert.equals(tpl._helpers, {});
        assert.equals(tpl._events, []);
      },

      "test not found": function () {
        Dom.newTemplate({name: "Foo.Bar.Baz"});
        assert.same(Dom.lookupTemplate('Foo.Fizz.Bar'), undefined);
      },

      "test nest by name": function () {
        Dom.newTemplate({name: "Foo.Bar.Baz"});

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
        assert.equals(tpl._helpers, {});
        assert.same(Dom.Foo.Bar.Baz.name, 'Baz');
      },
    },

    "with template": {
      setUp: function () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div", attrs:[["=","id",'foo'], ["", 'myHelper']],}],
        });
      },

      "test $created": function () {
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

      "test setBoolean": function () {
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
        setUp: function () {

          v.foo = Dom.Foo.$render();

          document.body.appendChild(v.foo);
        },

        "test focus": function () {
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

        "test replace element": function () {
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

    "test removeAll": function () {
      test.stub(Dom, 'remove');

      Dom.removeAll([1, 2]);

      assert.calledWith(Dom.remove, 1);
      assert.calledWith(Dom.remove, 2);
    },

    "test forEach": function () {
      var elm = Dom.html('<div></div>');
      document.body.appendChild(elm);
      for(var i = 0; i < 5; ++i) {
        elm.appendChild(Dom.html('<div class="foo">'+i+'</div>'));
      }

      var results = [];
      Dom.forEach(elm, '.foo', function (e) {
        results.push(e.textContent);
      });

      assert.same(results.join(','), '0,1,2,3,4');

      results = 0;
      Dom.forEach(document, 'div', function (e) {
        ++results;
      });

      assert.same(results, 6);
    },

    "test removeInserts": function () {
      var parent = document.createElement('div');
      var elm = document.createComment('start');
      elm._koruEnd = document.createComment('end');

      parent.appendChild(elm);
      [1,2,3].forEach(function (i) {
        parent.appendChild(document.createElement('p'));
      });
      parent.appendChild(elm._koruEnd);
      parent.appendChild(document.createElement('i'));

      test.spy(Dom, 'destroyChildren');

      Dom.removeInserts(elm);

      assert.calledThrice(Dom.destroyChildren);

      assert.same(parent.querySelectorAll('p').length, 0);
      assert.same(parent.querySelectorAll('i').length, 1);

      assert.same(elm.parentNode, parent);
      assert.same(elm._koruEnd.parentNode, parent);
    },

    "test rendering fragment": function () {
      Dom.newTemplate({
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

    "test inserting Document Fragment": function () {
      Dom.newTemplate({
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
      "test autostop": function () {
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


      "test no frag if only one child node": function () {
        Dom.newTemplate({
          name: "Foo",
          nodes:[{name: "div"}],
        });

        var elm = Dom.Foo.$render({});
        assert.same(elm.nodeType, document.ELEMENT_NODE);
        assert.same(elm.tagName, 'DIV');
      },

      "test frag if multi childs": function () {
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


      "test attributes": function () {
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

      "test parent": function () {
        Dom.newTemplate({
          name: "Foo.Bar",
          nested: [{
            name: "Baz",
          }],
        });

        assert.same(undefined, Dom.Foo.parent);
        assert.same(Dom.Foo, Dom.Foo.Bar.parent);
        assert.same(Dom.Foo.Bar, Dom.Foo.Bar.Baz.parent);
      },

      "test body": function () {
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

    "test INPUT_SELECTOR, WIDGET_SELECTOR": function () {
      assert.same(Dom.INPUT_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"]');
      assert.same(Dom.WIDGET_SELECTOR, 'input,textarea,select,select>option,[contenteditable="true"],button,a');

    },
  });
});
