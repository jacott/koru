isClient && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test-helper');
  var Dom = require('../dom');
  require('./page-link');
  var util = require('../util');
  var Route = require('./route');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      document.body.appendChild(v.parent = document.createElement('div'));
    },

    tearDown: function () {
      TH.domTearDown();
      delete Dom.Foo;
      v = null;
    },

    "test rendering": function () {
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

    "test append": function () {
      Dom.newTemplate({name: "Foo.Bar"});

      test.stub(Route, 'gotoPath');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", value: "foo bar", template: "Foo.Bar", append: "1234"}));

      assert.dom('#foo', function () {
        refute(this.getAttribute('append'));
        TH.click(this);
      });

      assert.calledWith(Route.gotoPath, Dom.Foo.Bar, {append: "1234"});
    },

    "test search": function () {
      Dom.newTemplate({name: "Foo.Bar"});

      test.stub(Route, 'gotoPath');
      document.body.appendChild(Dom._helpers.pageLink({id: "foo", value: "foo bar", template: "Foo.Bar", search: "foo=bar"}));

      assert.dom('#foo', function () {
        refute(this.getAttribute('search'));
        TH.click(this);
      });

      assert.calledWith(Route.gotoPath, Dom.Foo.Bar, {search: "?foo=bar"});
    },

    "test template": function () {
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
