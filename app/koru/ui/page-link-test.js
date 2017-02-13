isClient && define(function (require, exports, module) {
  const Dom   = require('../dom');
  const util  = require('../util');
  const Route = require('./route');
  const TH    = require('./test-helper');

  require('./page-link');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      document.body.appendChild(v.parent = document.createElement('div'));
    },

    tearDown() {
      TH.domTearDown();
      delete Dom.Foo;
      v = null;
    },

    "test rendering"() {
      test.stub(Route, 'gotoPath');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", name: 'baz', value: "foo bar", link: "/foo/bar"}));

      assert.dom(document.body, function () {
        assert.dom('button#foo.link[name=baz]', 'foo bar', function () {
          refute(this.getAttribute('link'));
          refute(this.getAttribute('value'));
          TH.click(this);
        });
      });

      assert.calledWith(Route.gotoPath, '/foo/bar');
    },

    "test use template name"() {
      const tpl = Dom.newTemplate({name: "Foo.Bar"});
      tpl.title = 'template title';

      document.body.appendChild(Dom._helpers.pageLink({id: "foo", var_fooId: 'foo123', template: "Foo.Bar", class: 'my class', append: "1234"}));

      assert.dom('#foo', 'template title', elm => assert.same(elm.className, 'my class'));
    },

    "test append"() {
      Dom.newTemplate({name: "Foo.Bar"});

      test.stub(Route, 'gotoPath');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", value: "foo bar", var_fooId: 'foo123', template: "Foo.Bar", append: "1234"}));

      assert.dom('#foo:not([var_fooId])', function () {
        refute(this.getAttribute('append'));
        TH.click(this);
      });

      assert.calledWith(Route.gotoPath, Dom.Foo.Bar, {append: "1234", fooId: 'foo123'});
    },

    "test search"() {
      Dom.newTemplate({name: "Foo.Bar"});

      test.stub(Route, 'gotoPath');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", value: "foo bar", template: "Foo.Bar", search: "foo=bar"}));

      assert.dom('#foo', function () {
        refute(this.getAttribute('search'));
        TH.click(this);
      });

      assert.calledWith(Route.gotoPath, Dom.Foo.Bar, {search: "?foo=bar"});
    },

    "test template"() {
      Dom.newTemplate({name: "Foo.Bar"});

      test.stub(Route, 'gotoPage');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", value: "foo bar", template: "Foo.Bar"}));

      assert.dom('#foo', function () {
        refute(this.getAttribute('template'));
        TH.click(this);
      });

      assert.calledWith(Route.gotoPage, Dom.Foo.Bar);
    },
  });
});
