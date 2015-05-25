isClient && define(function (require, exports, module) {
  var test, v;
  var koru = require('../main');
  var TH = require('./test-helper');
  var Route = require('./route');
  var Dom = require('../dom');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {
        root: Route.root,
        onGotoPath: Route._onGotoPath,
        origTitle: Route.title,
      };
      v.origTitle = document.title;
      Route.title = "TestTitle";
      v.FooBar = {
        name: 'FooBar',
        $autoRender: test.stub(),
        onEntry: test.stub(),
        onExit: test.stub(),
      };
      Route.root = new Route();
      test.stub(Route.history, 'pushState');
      test.stub(Route.history, 'replaceState');
      test.stub(koru, 'userId').returns("123");
    },

    tearDown: function () {
      Route.title = v.origTitle;
      document.title = v.origTitle;
      Route.root = v.root;
      Route._onGotoPath = v.onGotoPath;
      Route._reset();
      v = null;
    },

    "test title": function () {
      assert.same(v.origTitle, 'Running: Koru Test Mode');
    },

    "test focus": function () {
      var RootBar = {
        name: 'RootBar',
        $autoRender: function () {
          return Dom.html('<div id="RootBar">x</div>');
        },
      };

      Route.root.addTemplate(RootBar, {focus: '[name=foo]'});

      test.stub(Dom, 'focus');

      Route.gotoPage(RootBar);

      assert.dom('#RootBar', function () {
        assert.calledWith(Dom.focus, this, '[name=foo]');
      });
    },

    "test searchParams": function () {
      assert.equals(Route.searchParams(), {});

      assert.equals(Route.searchParams({search: "?foo=bar&baz=12"}), {foo: "bar", baz: "12"});
    },

    "with routeVar": {
      setUp: function () {
        v.Baz = {
          name: 'Baz',
          path: 'baz',
          onBaseEntry: test.stub(),
          onBaseExit: test.stub(),
        };

        v.RootBar = {
          name: 'RootBar',
          $autoRender: function () {
            return Dom.html('<div id="RootBar">x</div>');
          },
          onEntry: test.stub(),
          onExit: test.stub(),
        };

        Route.root.addBase(v.Baz, 'bazId');
        v.Baz.route.addTemplate(v.RootBar);
      },


      "test default root": function () {
        Route.root.routeVar = 'fooId';
        test.stub(Route, 'gotoPage');
        Route.root.defaultPage = v.RootBar;

        Route.gotoPath('/xyz');

        assert.calledWith(Route.gotoPage, v.RootBar, {fooId: "xyz", pathname: "/xyz"});
      },

      "test root pageRoute": function () {
        Route.root.routeVar = 'fooId';
        Route.root.onBaseEntry = test.stub();

        // test no pageRoute set
        Route.gotoPath('/baz/root-bar');
        assert.calledWith(Route.root.onBaseEntry, v.RootBar, {pathname: "/baz/root-bar"});


        // test baz routeVar changed (but not root routeVar)
        Route.root.onBaseEntry.reset();
        v.Baz.onBaseEntry.reset();

        Route.gotoPath('/baz/an-id/root-bar');
        refute.called(Route.root.onBaseEntry);
        assert.calledWith(v.Baz.onBaseExit, v.RootBar, {bazId: "an-id", pathname: "/baz/an-id/root-bar"});
        assert.calledWith(v.Baz.onBaseEntry, v.RootBar, {bazId: "an-id", pathname: "/baz/an-id/root-bar"});

        // test root routeVar changed
        Route.root.onBaseEntry.reset();

        Route.gotoPath('/xyz/baz/an-id/root-bar');
        assert.calledWith(Route.root.onBaseEntry, v.RootBar, {bazId: "an-id", fooId: "xyz", pathname: "/xyz/baz/an-id/root-bar"});

        // test no pageRoute passed to gotoPage
        Route.root.onBaseEntry.reset();
        v.Baz.onBaseEntry.reset();

        Route.gotoPage(v.RootBar);
        refute.called(Route.root.onBaseEntry);
        refute.called(v.Baz.onBaseEntry);
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", fooId: "xyz", pathname: "/xyz/baz/an-id/root-bar"});
      },

      "test gotoPath": function () {
        test.stub(Route, 'gotoPage');

        Route.gotoPath('/baz/an-id/root-bar');
        assert.calledWith(Route.gotoPage, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar'});

        Route.gotoPath('/baz/diff-id/root-bar');
        assert.calledWith(Route.gotoPage, v.RootBar, {bazId: "diff-id", pathname: '/baz/diff-id/root-bar'});
      },

      "test search and tag reset": function () {
        Route.gotoPath('/baz/an-id/root-bar?search=data#tag');
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar',
                                                         search: '?search=data', hash: '#tag'});

        assert.calledWith(Route.history.pushState, 1, null, "/#baz/an-id/root-bar?search=data#tag");
        v.RootBar.onEntry.reset();

        Route.gotoPath(v.RootBar);
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar'});
      },

      "test hash encoded": function () {
        Route.gotoPath('/baz/an-id/root-bar%23tag');
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar',
                                                         hash: '#tag'});
      },

      "waitForPage": {
        setUp: function () {
          test.spy(Route, 'onChange');
          test.stub(koru, 'setTimeout').returns(123);
          test.stub(koru, 'clearTimeout');
          v.resolve = test.stub(); v.reject = test.stub();
          v.MyPromise = function(func) {this.func = func};
          TH.stubProperty(window, 'Promise', v.MyPromise);
        },

        "test already on page": function () {
          var promise = Route.waitForPage(v.RootBar);
          assert.same(promise.constructor, v.MyPromise);

          Route.gotoPage(v.RootBar);
          promise.func(v.resolve, v.reject);

          assert.calledWith(v.resolve, v.RootBar, '/#baz/root-bar');
          refute.called(v.reject);
          refute.called(Route.onChange);
          refute.called(koru.setTimeout);
        },

        "test timeout": function () {
          var promise = Route.waitForPage(v.FooBar, 150);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 150);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          var stopSpy = test.spy(Route.onChange.returnValues[0], 'stop');

          koru.setTimeout.yield();

          assert.called(stopSpy);
          refute.called(v.resolve);
          assert.calledWith(v.reject, TH.match.field('message', 'Timed out waiting for: FooBar after 150ms'));
        },

        "test wrong page": function () {
          var promise = Route.waitForPage(v.FooBar);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 2000);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          var stopSpy = test.spy(Route.onChange.returnValues[0], 'stop');

          Route.gotoPage(v.RootBar);

          assert.calledWith(koru.clearTimeout, 123);
          assert.called(stopSpy);
          refute.called(v.resolve);
          assert.calledWith(v.reject, TH.match.field('message', 'expected page: FooBar, got: RootBar'));
        },

        "test page changed": function () {
          var promise = Route.waitForPage(v.RootBar);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 2000);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          var stopSpy = test.spy(Route.onChange.returnValues[0], 'stop');

          Route.gotoPage(v.RootBar);

          assert.calledWith(koru.clearTimeout, 123);
          assert.called(stopSpy);
          refute.called(v.reject);
          assert.calledWith(v.resolve, v.RootBar, '/#baz/root-bar');
        },
      },

      "test gotoPage, pushCurrent, recordHistory, notify": function () {
        var orig = Dom.setTitle;
        Dom.setTitle = test.stub();
        var onChange = Route.onChange(v.routeChanged = test.stub());
        test.onEnd(function () {
          Dom.setTitle = orig;
          onChange.stop();
        });
        v.RootBar.onEntry = function (page) {
          page.title = 'Root bar';
        };
        Route.gotoPage(v.RootBar, {bazId: "an-id", append: 'one/two'});
        assert.calledWith(Route.history.pushState, 1, null, '/#baz/an-id/root-bar/one/two');
        assert.same(document.title, 'Root bar');
        assert.calledWith(v.routeChanged, v.RootBar, '/#baz/an-id/root-bar/one/two');

        Route.gotoPage(v.RootBar, {bazId: "diff-id"});
        assert.calledWith(Route.history.pushState, 2, null, '/#baz/diff-id/root-bar');

        assert.calledTwice(v.Baz.onBaseEntry);

        assert.calledWith(Dom.setTitle, 'Root bar');

        Route.history.pushState.reset();

        Route.pushCurrent();

        assert.calledWith(Route.history.pushState, 3, null, '/#baz/diff-id/root-bar');
        assert.same(Route.pageCount, 3);

        Route.recordHistory(v.Baz, '/#href/123');

        assert.calledWith(Route.history.pushState, 4, null, '/#href/123');

        assert.same(Route.currentPage, v.RootBar);
        assert.same(Route.currentHref, '/#baz/diff-id/root-bar');
      },

      "test loadingArgs": function () {
        v.RootBar.onEntry = function () {
          v.loadingArgs = Route.loadingArgs;

        };

        Route.gotoPage(v.RootBar, {bazId: '123'});

        assert.equals(v.loadingArgs[0], v.RootBar);
        assert.equals(v.loadingArgs[1], {pathname: '/baz/123/root-bar', bazId: '123'});

        assert.same(Route.loadingArgs, null);

      },

      "test path append on template": function () {
        v.RootBar.onEntry = function (page, pageRoute) {
          v.append = pageRoute.append;
        };

        Route.gotoPath('/baz/123/root-bar/stuff/at/end');

        assert.same(v.append, 'stuff/at/end');
      },
    },

    "test append": function () {
      var RootBar = {
        name: 'RootBar',
        $autoRender: function () {
          return Dom.html('<div id="RootBar">x</div>');
        },
      };

      Route.root.addTemplate(RootBar);
      Route.gotoPage(RootBar, {append: "ap/this"});

      assert.calledWith(Route.history.pushState, 1, null, '/#root-bar/ap/this');
    },

    "test abort page change": function () {
      var Baz = {
        name: 'Baz',
        onBaseEntry: function () {
          Route.abortPage(RootBar);
        },
        onBaseExit: test.stub(),
      };

      var RootBar = {
        name: 'RootBar',
        $autoRender: test.stub(),
        onEntry: test.stub(),
        onExit: test.stub(),
      };

      Route.root.addTemplate(RootBar);
      Route.root.addBase(Baz);
      Baz.route.addTemplate(v.FooBar);


      Route.gotoPage(v.FooBar);

      refute.called(v.FooBar.onEntry);
      assert.called(RootBar.onEntry);
    },

    "test abortPage outside of gotoPage": function () {
      test.stub(Route, 'replacePath');

      Route.abortPage(1, 2,3);

      assert.calledWith(Route.replacePath, 1, 2, 3);
    },

    "test push history": function () {
      assert.same(Route._orig_history, window.history);

      Route.root.addTemplate(v.FooBar);
      v.FooBar.onEntry = function () {
        Route.title = "foo title";
      };

      Route.gotoPage(v.FooBar);

      assert.calledWith(Route.history.pushState, 1, null, '/#foo-bar');
      assert.same(document.title, 'foo title');
    },

    "test replace history": function () {
      Route.title = "baz bar";
      Route.root.addTemplate(v.FooBar);
      Route.replacePath(v.FooBar);

      assert.calledWith(Route.history.replaceState, 1, null, '/#foo-bar');
      assert.same(Route.pageState, 'pushState');
    },

    "test replacePage passes all args": function () {
      test.stub(Route, 'gotoPage', function () {
        v.pageState = Route.pageState;
      });

      Route.replacePage(1, 2,3);

      assert.same(v.pageState, 'replaceState');
      assert.same(Route.pageState, 'pushState');
      assert.calledWith(Route.gotoPage, 1, 2, 3);
    },

    "test replacePath passes all args": function () {
      test.stub(Route, 'gotoPath', function () {
        v.pageState = Route.pageState;
      });

      Route.replacePath(1, 2,3);
      assert.same(v.pageState, 'replaceState');
      assert.same(Route.pageState, 'pushState');

      assert.calledWith(Route.gotoPath, 1, 2, 3);
    },

    "test pageChanged": function () {
      test.stub(Route, 'gotoPath');
      Route.root.addTemplate(v.FooBar);
      Route.pageChanged();

      assert.calledWithExactly(Route.gotoPath);
      refute.called(Route.history.pushState);
      refute.called(Route.history.replaceState);
      assert.same(Route.pageState, 'pushState');

      v.FooBar.onEntry = function (page, pageRoute) {
        v.pageRoute = pageRoute;
        assert.same(Route.targetPage, v.FooBar);

        return 'thehref';
      };
      v.FooBar.title = 'foo bar';

      Route.gotoPath.restore();
      Route.gotoPath('/foo-bar');


      assert.same(Route.targetPage, v.FooBar);
      assert.same(Route.currentPage, v.FooBar);
      assert.same(Route.currentPageRoute, v.pageRoute);
      assert.same(Route.currentHref, '/#thehref');
      assert.same(Route.currentTitle, 'foo bar');
    },

    "test replacePage always changes history": function () {
      Route.root.addTemplate(v.FooBar);
      Route.gotoPath('/foo-bar');

      Route.history.replaceState.reset();

      Route.replacePath('/foo-bar');

      assert.called(Route.history.replaceState);
    },

    "test root": function () {
      assert.same(v.root.constructor, Route);
    },

    "test addBase and addAlias": function () {
      var Baz = {
        name: 'Baz',
        onBaseEntry: test.stub(),
        onBaseExit: test.stub(),
        $path: 'bazpath',
      };

      var Fnord = {
        name: 'Fnord',
        onBaseEntry: test.stub(),
        onBaseExit: test.stub(),
      };

      var BazBar = {
        name: 'Baz',
        $autoRender: test.stub(),
        onEntry: test.stub(),
        onExit: test.stub(),
      };

      var RootBar = {
        name: 'RootBar',
        $autoRender: test.stub(),
        onEntry: test.stub(),
        onExit: test.stub(),
      };

      Route.root.addTemplate(RootBar);

      Route.root.addBase(Baz);
      Baz.route.addBase(Fnord);
      Fnord.route.addTemplate(v.FooBar);
      Baz.route.addTemplate(BazBar);

      Route.root.addAlias(BazBar, 'short-cut');

      assert.same(Fnord.route.path, 'fnord');
      assert.same(Fnord.route.parent, Baz.route);

      Route.gotoPath('bazpath//fnord/foo-bar');

      assert.called(v.FooBar.onEntry);
      assert.called(Baz.onBaseEntry);
      assert.called(Fnord.onBaseEntry);

      Route.gotoPath(BazBar);

      assert.called(v.FooBar.onExit);
      assert.called(BazBar.onEntry);

      assert.called(Fnord.onBaseExit);
      refute.called(Baz.onBaseExit);

      v.FooBar.onEntry.reset();
      Baz.onBaseEntry.reset();
      Fnord.onBaseEntry.reset();
      Fnord.onBaseExit.reset();

      Fnord.onBaseEntry.reset();


      Route.gotoPage(v.FooBar);

      var loc = {pathname: "/bazpath/fnord/foo-bar"};

      assert.calledWith(BazBar.onExit, v.FooBar, loc);
      assert.calledWith(v.FooBar.onEntry, v.FooBar, loc);

      assert.calledWith(Fnord.onBaseEntry, v.FooBar, loc);
      refute.called(Baz.onBaseExit);

      Route.gotoPage(RootBar);

      assert.calledWith(Baz.onBaseExit, RootBar, { pathname: "/root-bar" });

      BazBar.onEntry.reset();

      Route.gotoPath('/short-cut/12345');

      assert.calledWith(BazBar.onEntry, BazBar, {append: '12345', pathname: "/bazpath/baz/12345"});
    },

    "test privatePage": function () {
      var origSigninPage = Route.SignInPage;
      Route.SignInPage = "mySign in page";
      test.onEnd(function () {
        Route.SignInPage = origSigninPage;
      });
      test.stub(Route, 'replacePage');
      koru.userId.restore();

      Route.root.addTemplate(v.FooBar, {privatePage: true});

      Route.gotoPage(v.FooBar, {myArgs: '123'});

      refute.called(v.FooBar.onEntry);

      assert.calledWith(Route.replacePage, Route.SignInPage, {returnTo: [v.FooBar, {myArgs: '123', pathname: '/foo-bar'}]});
    },

    "test addTemplate": function () {
      var Baz = {
        name: 'Baz',
        parent: v.FooBar,

        $autoRender: function (arg) {
          return Dom.html('<div id="Baz">'+arg+'</div>');
        },
      };

      Route.root.addTemplate(v.FooBar);
      Route.root.addTemplate(Baz, {data: function () {return 'fooData'}});

      assert.isFunction(Baz.onEntry);

      Baz.onEntry();

      assert.dom('#Baz', 'fooData');

      Baz.onExit();

      refute.dom('#Baz');
    },

    "test gotoPath default": function () {
      Route.root.addTemplate(v.FooBar, {path: "foo-location"});
      test.stub(koru, 'getLocation').returns({pathname: "/foo-location/append-data"});

      Route.gotoPath();
      assert.called(v.FooBar.onEntry);
    },

    "test addDialog gotoPath": function () {
      Route.root.addTemplate(v.FooBar);

      var FooDialog = {
        onEntry: test.stub(),
      };

      Route.root.addDialog(FooDialog, {path: 'foo-dialog'});

      Route.gotoPath(v.loc = {pathname: '/foo-bar'});

      Route.gotoPath(v.loc = '/foo-dialog/append/string?abc=123#hash');

      refute.called(v.FooBar.onExit);

      assert.calledWith(FooDialog.onEntry, FooDialog, {pathname: '/foo-dialog/append/string',
                                                       append: 'append/string',
                                                       search: '?abc=123', hash: '#hash'});

      assert.same(Route.currentPage, v.FooBar);

      Route.gotoPath(v.loc = {pathname: '/foo-bar'});

      assert.called(v.FooBar.onExit);
      assert.calledTwice(v.FooBar.onEntry);

    },

    "test addTemplate gotoPath": function () {
      var Bar = {
        name: 'Bar',
        $autoRender: test.stub(),
        onEntry: test.stub(),
      };
      Route.root.addTemplate(v.FooBar);
      assert.exception(function () {
        Route.root.addTemplate('foo-bar', v.FooBar);
      });

      Route.root.addTemplate(Bar);

      Route.gotoPath(v.loc = {pathname: '/foo-bar'});

      assert.calledWith(v.FooBar.onEntry, v.FooBar, v.loc);

      v.loc = {pathname: '/bar'};
      Route.gotoPath(v.loc.pathname);

      assert.calledWith(v.FooBar.onExit, Bar, v.loc);
      assert.calledWith(Bar.onEntry, Bar, v.loc);
    },

    "test passing string": function () {
      Route.root.defaultPage = v.FooBar;

      Route.gotoPath('/anything?abc=123&def=456#hash');

      assert.calledWith(v.FooBar.onEntry, v.FooBar, {pathname: '', search: '?abc=123&def=456', hash: '#hash'});
    },

    "test passing object": function () {
      Route.root.defaultPage = v.FooBar;

      Route.gotoPath({pathname: '/anything', search: '?abc=123&def=456', hash: '#hash'});

      assert.calledWith(v.FooBar.onEntry, v.FooBar, {pathname: '', search: '?abc=123&def=456', hash: '#hash'});
    },
  });
});
