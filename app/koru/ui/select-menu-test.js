isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var sut = require('./select-menu');
  var Dom = require('../dom');
  var Each = require('./each');
  var $ = Dom.current;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.TestTpl = Dom.newTemplate(module, require('koru/html!./select-menu-test'));

      document.body.appendChild(v.testSelectMenu = v.TestTpl.$autoRender({}));
      v.result = false;
      v.popup = function (customize, pos) {
        assert.dom('#TestSelectMenu [name=select]', function () {
          this.focus();
          sut.popup(this, {
            customize: function () {
              $.element.style.position = 'absolute';
              customize && customize.call(this);
            },
            list: [[1, 'One'], [2, 'Two']],
            onSelect: function (elm, event) {
              v.currentTarget = event.currentTarget;
              v.elm = elm;
              return v.result;
            }}, pos);
          v.button = this;
        });
      };
    },

    tearDown: function () {
      TH.domTearDown();
      v = null;
    },

    "test onClose": function () {
      assert.dom('#TestSelectMenu [name=select]', function () {
        sut.popup(this, {
          onClose: v.onClose = test.stub(),
          onSelect: function () {return true},
        });
      });

      assert.dom('body>.glassPane', function () {
        Dom.remove(this);
      });
      assert.called(v.onClose);
    },

    "test can select by object": function () {
      var stub = function(arg) {
        v.arg = arg;
      };
      var items = sut.List._helpers.items;

      items.call({list: [v.expect = {name: 123}]}, stub);

      assert.same(v.arg, v.expect);

      items.call({list: [[123, 'foo']]}, stub);

      assert.equals(v.arg, {id: 123, name: 'foo'});
    },

    "test selected array data": function () {
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [[1, 'One'], [2, 'Two']],
        selected: 2,
        onSelect: function (elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {data:TH.match.field('id', 2)});
      });
    },

    "test selected object data": function () {
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [{_id: 1, name: 'One'}, {_id: 2, name: 'Two'}],
        selected: 2,
        onSelect: function (elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {count: 1});
        assert.dom('.selected', {data:TH.match.field('_id', 2)});
      });
    },

    "test multi select": function () {
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.button = this;
      });

      sut.popup(v.button, {
        list: [{_id: 1, name: 'One'}, {_id: 2, name: 'Two'}, {_id: 3, name: 'Three'}],
        selected: [3, 2],
        onSelect: function (elm, event) {
        },
      });

      assert.dom('body>.glassPane', function () {
        assert.dom('.selected', {count: 2});
        assert.dom('.selected', {data:TH.match.field('_id', 2)});
        assert.dom('.selected', {data:TH.match.field('_id', 3)});
      });
    },

    "test nameSearch": function () {
      assert.same(sut.nameSearch(/foo/, {name: 'a foo'}), true);
      assert.same(sut.nameSearch(/foo/, {name: 'a fuz'}), false);
    },

    "test search": function () {
      assert.dom('#TestSelectMenu [name=select]', function () {
        v.searchStub = test.stub();
        this.focus();
        sut.popup(this, {
          search: function (reg, data) {
            v.searchStub();
            return reg.test(data.name);
          },
          searchDone: v.searchDone = test.stub(),
          rendered: v.rendered = test.stub(),
          list: [[1, 'One'], [2, 'Two'], [3, 'Three']],
          onSelect: function (elm, event) {
            v.elm = elm;
            v.which = event.which;
            return true;
          },
        });
        v.button = this;
      });
      var ev;
      assert.dom('body>.glassPane>#SelectMenu', function () {
        v.selectMenuELm = this;
        assert.dom('input[name=search][autocomplete=off]', function () {
          assert.same(document.activeElement, this);

          v.search = this;
          v.search.addEventListener('keydown', v.inputel = test.stub());
          test.onEnd(function () {
            v.search.removeEventListener('keydown', v.inputel);
          });
          TH.input(v.search, 'one');
          var ev = keydown(101 /* e */);
          assert.called(v.inputel);
          assert.called(ev.stopImmediatePropagation);
          refute.called(ev.preventDefault);
          assert.calledOnceWith(v.searchDone, this, v.selectMenuELm);
          assert(v.searchDone.calledAfter(v.searchStub));
        });
        assert.calledOnceWith(v.rendered, this);
        assert.dom('li.hide', {count: 2});
        assert.dom('li:not(.hide)', 'One', function () {
          Dom.addClass(v.one = this, 'selected');
        });
        TH.input(v.search, 't');
        assert.dom('li.hide', {count: 1, text: 'One'});
        TH.trigger(v.search, 'keydown', {which: 13});
        ev = keydown(40);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
        assert.dom('li.selected', 'Two');
        assert.dom('li:not(.selected)', 'One');
        TH.trigger(v.search, 'keydown', {which: 40});
        assert.dom('li.selected', 'Three');
        assert.dom('li:not(.selected)', 'Two');
        TH.trigger(v.search, 'keydown', {which: 40});
        assert.dom('li.selected', 'Three');
        TH.trigger(v.search, 'keydown', {which: 38});
        assert.dom('li.selected', 'Two');
        assert.dom('li:not(.selected)', 'One');
        TH.trigger(v.search, 'keydown', {which: 38});
        assert.dom('li.selected', 'Two');
        ev = keydown(13);
        assert.called(ev.stopImmediatePropagation);
        assert.called(ev.preventDefault);
      });
      assert.same(v.elm.textContent, 'Two');
      refute.dom('glassPane');
      assert.same(document.activeElement, document.querySelector('#TestSelectMenu [name=select]'));

      function keydown(keycode) {
        var ev = TH.buildEvent('keydown', {which: keycode});
        test.spy(ev, 'stopImmediatePropagation');
        test.spy(ev, 'preventDefault');
        TH.trigger(v.search, ev);
        return ev;
      }
    },

    "position": {
      "test default": function () {
        v.popup();
        assert.dom('body>.glassPane>#SelectMenu', function () {
          var bbox = v.button.getBoundingClientRect();
          assert.cssNear(this, 'top', bbox.top + bbox.height, 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      },

      "test above": function () {
        v.testSelectMenu.style.position = 'absolute';
        v.testSelectMenu.style.bottom = '250px';
        v.popup(null, 'above');
        assert.dom('body>.glassPane>#SelectMenu', function () {
          var bbox = v.button.getBoundingClientRect();
          assert.same(this.style.top, '');
          assert.cssNear(this, 'bottom', window.innerHeight - bbox.top, 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      },

      "test full height": function () {
        v.popup(function () {
          $.element.style.height = (window.innerHeight + 200)+'px';
        });
        assert.dom('#SelectMenu', function () {
          var bbox = v.button.getBoundingClientRect();
          assert.cssNear(this, 'top', 0);
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      },

      "test no room below": function () {
        assert.dom('#TestSelectMenu [name=select]', function () {
          this.style.position = 'absolute';
          this.style.top = (window.innerHeight * .75)+'px';
        });
        v.popup(function () {
          $.element.style.height = (window.innerHeight * .5)+'px';
        });
        assert.dom('#SelectMenu', function () {
          var bbox = v.button.getBoundingClientRect();
          assert.same(this.style.top, '');
          assert.cssNear(this, 'bottom', (window.innerHeight - bbox.top), 2, 'px');
          assert.cssNear(this, 'left', bbox.left, 2, 'px');
        });
      },

      "test no room above": function () {
        v.popup(function () {
          $.element.style.height = (window.innerHeight * .2)+'px';
        }, 'above');
        assert.dom('#SelectMenu', function () {
          var bbox = v.button.getBoundingClientRect();
          assert.same(this.style.bottom, '');
          assert.cssNear(this, 'top', (bbox.top + bbox.height), 2, 'px');
        });
      },
    },

    "when open": {
      setUp: function () {
        v.popup();
      },

      "test content": function () {
        assert.dom('#SelectMenu ul', function () {
          refute.dom('input');
          assert.dom('li', 'One');
          assert.dom('li', 'Two');
        });
      },

      "test select by mouse click": function () {
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              TH.trigger(this, 'mousedown');
              TH.trigger(this, 'mouseup');
              TH.click(this);
              assert.same(v.elm, this);
            });

            assert.same(v.currentTarget, this);
          });
          assert.dom('#SelectMenu');
          TH.trigger(this, 'mousedown');
          assert.dom('#SelectMenu');
          TH.trigger('body>.glassPane', 'mousedown');
          refute.dom('#SelectMenu');
        });
      },

      "test autoClose": function () {
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              v.result = true;
              TH.click(this);
              assert.same(v.elm, this);
            });
          });
          refute.dom('#SelectMenu');
        });
        assert.same(document.activeElement, document.querySelector('#TestSelectMenu [name=select]'));
      },

      "test tab closes list": function () {
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              TH.trigger(this, 'keydown', {which: 9});
            });
          });
          refute.dom('#SelectMenu');
        });
      },

      "test escape closes list": function () {
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              TH.trigger(this, 'keydown', {which: 27});
            });
          });
          refute.dom('#SelectMenu');
        });
      },

      "test clicking off list closes list": function () {
        assert.dom('#TestSelectMenu>br');
        TH.trigger('body>.glassPane', 'mousedown');
        refute.dom('#SelectMenu');
      },

      "test can't select disabled": function () {
        assert.dom(document.body, function () {
          assert.dom('#SelectMenu>ul', function () {
            assert.dom('li:first-child', function () {
              Dom.addClass(this, 'disabled');
              TH.click(this);
              assert.same(v.elm, undefined);
            });
          });
          assert.dom('#SelectMenu');
        });
      },
    },

  });
});
