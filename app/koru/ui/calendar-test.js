isClient && define(function (require, exports, module) {
  var test, v;
  const Dom  = require('../dom');
  const util = require('../util');
  const sut  = require('./calendar');
  const Each = require('./each');
  const TH   = require('./test-helper');

  const $ = Dom.current;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.TestTpl = Dom.newTemplate(module, require('koru/html!./calendar-test'));
      v.open = function (date) {
        util.withDateNow(date, function () {
          assert.dom('#TestCalendar [name=testField]', function () {
            this.focus();
            TH.trigger(this, 'focusin');
          });
        });
      };

      sut.register(v.TestTpl, 'input.date', {customize(cal) {
        cal.style.position = 'absolute';
      }});

      document.body.appendChild(v.testSelectMenu = v.TestTpl.$autoRender({}));
    },

    tearDown() {
      TH.domTearDown();
      v = null;
    },

    "test no options"() {
      TH.click('[name=other]');
      refute.dom('#Calendar');
      Dom.remove(v.testSelectMenu);
      sut.register(v.TestTpl, '[name=other]');
      document.body.appendChild(v.testSelectMenu = v.TestTpl.$autoRender({}));

      TH.click('[name=other]');
      assert.dom('.Calendar');
    },

    "test click opens"() {
      assert.dom('#TestCalendar [name=testField]', function () {
        TH.input(this, '2014-10-05');
        TH.click(this);
        v.ctx = Dom.myCtx(this);
        TH.click(this);
        assert.same(Dom.myCtx(this), v.ctx);

      });
      assert.dom('.Calendar', {count: 1}, function () {
        assert.dom('header span', 'October 2014');
        assert.dom('td.select.current', '5');
        assert.same(v.ctx._koruCalendar, this);
        Dom.remove(this);
      });
      assert.same(v.ctx._koruCalendar, null);
      assert.dom('#TestCalendar [name=testField]', function () {
        TH.click(this);
        Dom.remove(this);
      });

      refute.dom('.Calendar');
    },

    "test change Month"() {
      v.open(new Date(2015, 0, 31));
      assert.dom('body>.Calendar', function () {
        assert.dom('header', function () {
          TH.click('[name=previous]');
          assert.dom('span', 'December 2014');
        });
        assert.dom('td.select.current', '31');
        TH.click('header [name=next]');
        assert.dom('td.select.current', '31');
        TH.click('[name=next]');
        assert.dom('span', 'February 2015');
        assert.dom('td.select.current', '28');
      });
    },

    "test pick date"() {
      v.open(new Date(2015, 11, 31));
      Dom('[name=testField]').addEventListener('change', v.change = test.stub());
      assert.dom('body>.Calendar td', '25', function () {
        test.spy(Dom, 'stopEvent');
        TH.trigger(document.body.lastChild, 'pointerdown');
        assert.called(Dom.stopEvent);
        TH.click(this);
      });
      assert.dom('[name=testField]', function () {
        assert.same(document.activeElement, this);
        assert.same(this.value, '2015-12-25');
        assert.called(v.change);
      });
      refute.dom('.Calendar');
    },

    "test rendering"() {
      v.open(new Date(2015, 2, 23));
      assert.dom('input.date', function () {
        v.ibox = this.getBoundingClientRect();
      });
      assert.dom('body>.Calendar', function () {
        assert.same(this.style.position, 'absolute');

        assert.cssNear(this, 'left', v.ibox.left);
        assert.cssNear(this, 'top', v.ibox.top + v.ibox.height);
        assert.dom('header', function () {
          assert.dom('span', 'March 2015');
        });
        assert.dom('table>tbody', function () {
          assert.dom('tr:first-child.dow', 'MoTuWeThFrSaSu', function () {
            assert.dom('td', {count: 7});
          });
          assert.dom('tr:nth-child(2)', function () {
            assert.dom('td:first-child.previous:not(.select)', '23');
            assert.dom('td:last-child.current', '1');
          });
          assert.dom('tr:nth-child(4)', function () {
            assert.dom('td:first-child.current', '9');
            assert.dom('td:last-child.current', '15');
          });
          assert.dom('tr:nth-child(6)', function () {
            assert.dom('td:nth-child(1).current.today.select', '23');
          });
          assert.dom('tr:last-child', function () {
            assert.dom('td:first-child.current', '30');
            assert.dom('td:last-child.next', '5');
          });
        });

        Dom.ctx(this).updateAllTags(new Date(2015,4,10));
        assert.dom('header', function () {
          assert.dom('span', 'May 2015');
        });
        assert.dom('table>tbody', function () {
          assert.dom('tr:last-child', function () {
            assert.dom('td:first-child.current', '25');
            assert.dom('td:last-child.current', '31');
          });
          assert.dom('td.select.current', '10');
        });

        Dom.ctx(this).updateAllTags(new Date(2015,5,7));
        assert.dom('header', function () {
          assert.dom('span', 'June 2015');
        });
        assert.dom('table>tbody', function () {
          assert.dom('tr:nth-child(2)', function () {
            assert.dom('td:first-child.current', '1');
            assert.dom('td:last-child.current.select', '7');
          });
        });
      });
    },

    "test focusout"() {
      v.open(new Date(2013-01-02));
      TH.trigger('[name=testField]', 'focusout');

      refute.dom('.Calendar');
    },

    "test up down escape"() {
      function keydown(code) {TH.trigger(v.input, 'keydown', {which: code})}

      assert.dom('[name=testField]', function () {
        TH.input(this, '2013-01-01');
        TH.click(this);
        v.input = this;
        keydown(38);
        assert.same(this.value, '2012-12-31');
      });
      assert.dom('.Calendar', function () {
        assert.dom('span', 'December 2012');
        assert.dom('td.select', '31');
        keydown(38);
        assert.dom('td.select', '30');
        keydown(40);
        keydown(40);
        keydown(40);
        assert.same(v.input.value, '2013-01-02');
        assert.dom('td.select', '2');
        assert.dom('span', 'January 2013');
      });
      test.spy(Dom, 'stopEvent');
      keydown(27);
      assert.dom('.Calendar');
      assert.called(Dom.stopEvent);
      TH.trigger(v.input, 'keyup', {which: 27}); // stop propigation on up
      refute.dom('.Calendar');
      assert.calledTwice(Dom.stopEvent);
    },
  });
});
