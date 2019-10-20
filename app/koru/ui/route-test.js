isClient && define((require, exports, module)=>{
  'use strict';
  /**
   * Route is a paginging system within a one page app. It manages
   * creating and destroying pages and recording history.
   **/
  const api             = require('koru/test/api');
  const Dom             = require('../dom');
  const koru            = require('../main');
  const TH              = require('./test-helper');

  const {stub, spy, intercept} = TH;

  const Route = require('./route');

  let v;

  TH.testCase(module, ({after, beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v = {
        root: Route.root,
        onGotoPath: Route._onGotoPath,
        origTitle: Route.title,
      };
      v.origTitle = document.title;
      Route.title = "TestTitle";
      v.FooBar = {
        name: 'FooBar',
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };
      Route.root = new Route();
      stub(Route.history, 'pushState');
      stub(Route.history, 'replaceState');
      stub(koru, 'userId').returns("123");
    });

    afterEach(()=>{
      Route.title = v.origTitle;
      document.title = v.origTitle;
      Route.root = v.root;
      Route._onGotoPath = v.onGotoPath;

      Route._reset();
      Dom.Test = undefined;
      Dom.removeChildren(document.body);
      v = undefined;
    });

    test("title", ()=>{
      assert.same(v.origTitle, 'Koru Test Mode');
    });

    test("focus", ()=>{
      const RootBar = {
        name: 'RootBar',
        $autoRender() {
          return Dom.textToHtml('<div id="RootBar">x</div>');
        },
      };

      Route.root.addTemplate(RootBar, {focus: '[name=foo]'});

      stub(Dom, 'focus');

      Route.gotoPage(RootBar);

      assert.dom('#RootBar', self => {
        assert.calledWith(Dom.focus, self, '[name=foo]');
      });
    });

    test("searchParams", ()=>{
      assert.equals(Route.searchParams(), {});

      assert.equals(Route.searchParams({search: "?foo=bar&baz=12"}), {foo: "bar", baz: "12"});
    });

    group("with routeVar", ()=>{
      beforeEach(()=>{
        v.Baz = {
          name: 'Baz',
          path: 'baz',
          onBaseEntry: stub(),
          onBaseExit: stub(),
        };

        v.RootBar = {
          name: 'RootBar',
          $autoRender() {
            return Dom.textToHtml('<div id="RootBar">x</div>');
          },
          onEntry: stub(),
          onExit: stub(),
        };

        Route.root.addBase(v.Baz, {routeVar: 'bazId'});
        v.Baz.route.addTemplate(v.RootBar);
      });

      test("async addBase", ()=>{
        v.Baz.route.async = true;

        Route.gotoPath('/baz/an-id/root-bar');

        refute.called(v.RootBar.onEntry);
        assert.calledWith(v.Baz.onBaseEntry, TH.match.object, {pathname: '/baz/an-id/root-bar', bazId: 'an-id'}, TH.match.func);
        v.Baz.onBaseEntry.yield();
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {pathname: '/baz/an-id/root-bar', bazId: 'an-id'});
        v.RootBar.onEntry.reset();
        v.Baz.onBaseEntry.yield();
        refute.called(v.RootBar.onEntry);
      });

      test("async page change before callback", ()=>{
        v.Baz.route.async = true;

        Route.gotoPath('/baz/an-id/root-bar');

        refute.called(v.RootBar.onEntry);
        assert.calledWith(v.Baz.onBaseEntry, TH.match.object, {pathname: '/baz/an-id/root-bar', bazId: 'an-id'}, TH.match.func);
        Route.gotoPage('/');
        v.Baz.onBaseEntry.yield();
        refute.called(v.RootBar.onEntry);
      });

      test("default root", ()=>{
        Route.root.routeVar = 'fooId';
        stub(Route, 'gotoPage');
        Route.root.defaultPage = v.RootBar;

        Route.gotoPath('/xyz');

        assert.calledWith(Route.gotoPage, v.RootBar, {fooId: "xyz", pathname: "/xyz"});
      });

      test("root pageRoute", ()=>{
        Route.root.routeVar = 'fooId';
        Route.root.onBaseEntry = stub();

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
      });

      test("gotoPath", ()=>{
        stub(Route, 'gotoPage');

        Route.gotoPath('/baz/an-id/root-bar');
        assert.calledWith(Route.gotoPage, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar'});

        Route.gotoPath('/baz/diff-id/root-bar');
        assert.calledWith(Route.gotoPage, v.RootBar, {bazId: "diff-id", pathname: '/baz/diff-id/root-bar'});
      });

      test("search and tag reset", ()=>{
        Route.gotoPath('/baz/an-id/root-bar?search=data#tag');
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar',
                                                         search: '?search=data', hash: '#tag'});

        assert.calledWith(Route.history.pushState, 1, null, "/#baz/an-id/root-bar?search=data#tag");
        v.RootBar.onEntry.reset();

        Route.gotoPath(v.RootBar);
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar'});
      });

      test("hash encoded", ()=>{
        Route.gotoPath('/baz/an-id/root-bar%23tag');
        assert.calledWith(v.RootBar.onEntry, v.RootBar, {bazId: "an-id", pathname: '/baz/an-id/root-bar',
                                                         hash: '#tag'});
      });

      group("waitForPage", ()=>{
        beforeEach(()=>{
          spy(Route, 'onChange');
          stub(koru, 'setTimeout').returns(123);
          stub(koru, 'clearTimeout');
          v.resolve = stub(); v.reject = stub();
          v.MyPromise = function(func) {this.func = func};
          TH.stubProperty(window, 'Promise', v.MyPromise);
        });

        test("already on page", ()=>{
          const promise = Route.waitForPage(v.RootBar);
          assert.same(promise.constructor, v.MyPromise);

          Route.gotoPage(v.RootBar);
          promise.func(v.resolve, v.reject);

          assert.calledWith(v.resolve, v.RootBar, '/#baz/root-bar');
          refute.called(v.reject);
          refute.called(Route.onChange);
          refute.called(koru.setTimeout);
        });

        test("timeout", ()=>{
          const promise = Route.waitForPage(v.FooBar, 150);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 150);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          const stopSpy = spy(Route.onChange.firstCall.returnValue, 'stop');

          koru.setTimeout.yield();

          assert.called(stopSpy);
          refute.called(v.resolve);
          assert.calledWith(v.reject, TH.match.field('message', 'Timed out waiting for: FooBar after 150ms'));
        });

        test("wrong page", ()=>{
          const promise = Route.waitForPage(v.FooBar);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 2000);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          const stopSpy = spy(Route.onChange.firstCall.returnValue, 'stop');

          Route.gotoPage(v.RootBar);

          assert.calledWith(koru.clearTimeout, 123);
          assert.called(stopSpy);
          refute.called(v.resolve);
          assert.calledWith(v.reject, TH.match.field('message', 'expected page: FooBar, got: RootBar'));
        });

        test("page changed", ()=>{
          const promise = Route.waitForPage(v.RootBar);

          promise.func(v.resolve, v.reject);

          assert.calledWith(koru.setTimeout, TH.match.func, 2000);
          assert.calledWith(Route.onChange, TH.match.func);
          refute.called(v.resolve);
          refute.called(v.reject);
          const stopSpy = spy(Route.onChange.firstCall.returnValue, 'stop');

          Route.gotoPage(v.RootBar);

          assert.calledWith(koru.clearTimeout, 123);
          assert.called(stopSpy);
          refute.called(v.reject);
          assert.calledWith(v.resolve, v.RootBar, '/#baz/root-bar');
        });
      });

      test("pushHistory", ()=>{
        Route.pushHistory(v.pageRoute = {pathname: '/foo', hash: '#bar'});
        assert.calledWith(Route.history.pushState, 1, null, '/#foo#bar');
        assert.same(Route.currentPageRoute, v.pageRoute);
        assert.same(Route.currentHref, '/#foo#bar');
      });

      test("replaceHistory", ()=>{
        Route.replaceHistory(v.pageRoute = {pathname: 'foo', hash: '#bar'});
        assert.calledWith(Route.history.replaceState, 0, null, '/#foo#bar');
        assert.same(Route.currentPageRoute, v.pageRoute);
        assert.same(Route.currentHref, '/#foo#bar');
      });

      test("setTitle", ()=>{
        /**
         * Set the `document.title` for the current page.
         **/
        api.method('setTitle');

        intercept(Dom, 'setTitle', title =>{
          v.title = title+' etc';
          return "returned title";
        });

        Route.setTitle('my title');

        assert.same(v.title, 'my title etc');
        assert.same(document.title, 'returned title');
      });

      group("overrideHistory", ()=>{
        test("suppress", ()=>{
          Route.overrideHistory(null, () => {
            Route.recordHistory(v.FooBar, '/#not-me#bar');
          });
          Route.recordHistory(v.FooBar, '/#foo#bar');
          assert.calledOnceWith(Route.history.pushState, 1, null, '/#foo#bar');
        });
        test("replaceState", ()=>{
          Route.overrideHistory('replaceState', () => {
            Route.recordHistory(v.FooBar, '/#replace-foo#bar');
          }, 'replaceState');
          Route.recordHistory(v.FooBar, '/#foo#bar');
          assert.calledOnceWith(Route.history.replaceState, 0, null, '/#replace-foo#bar');
          assert.calledOnceWith(Route.history.pushState, 1, null, '/#foo#bar');
        });
      });

      test("gotoPage, pushCurrent, recordHistory, notify", ()=>{
        const orig = Dom.setTitle;
        Dom.setTitle = stub();
        const onChange = Route.onChange(v.routeChanged = stub());
        after(()=>{
          Dom.setTitle = orig;
          onChange.stop();
        });
        v.RootBar.onEntry = page =>{page.title = 'Root bar'};
        Route.gotoPage(v.RootBar, {bazId: "an-id", append: 'one/two'});
        assert.calledWith(Route.history.pushState, 1, null, '/#baz/an-id/root-bar/one/two');
        assert.same(document.title, 'Root bar');
        assert.calledWith(v.routeChanged, v.RootBar, {bazId: "an-id", append: 'one/two', pathname: TH.match.any}, '/#baz/an-id/root-bar/one/two');

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
        assert.same(Route.currentHref, '/#href/123');
      });

      test("loadingArgs", ()=>{
        v.RootBar.onEntry = ()=>{v.loadingArgs = Route.loadingArgs};

        Route.gotoPage(v.RootBar, {bazId: '123'});

        assert.equals(v.loadingArgs[0], v.RootBar);
        assert.equals(v.loadingArgs[1], {pathname: '/baz/123/root-bar', bazId: '123'});

        assert.same(Route.loadingArgs, null);

      });

      test("path append on template", ()=>{
        v.RootBar.onEntry = (page, pageRoute)=>{
          v.append = pageRoute.append;
        };

        Route.gotoPath('/baz/123/root-bar/stuff/at/end');

        assert.same(v.append, 'stuff/at/end');
      });
    });

    test("append", ()=>{
      /**
       * Goto the specified `page` and record in `window.history`.
       **/
      api.method('gotoPage');
      const AdminProfile = Dom.newTemplate({
        name: 'Test.AdminProfile',
        nodes: [{name: 'div'}]
      });

      Route.root.addTemplate(AdminProfile);
      Route.gotoPage(AdminProfile, {append: "my/id"});

      assert.calledWith(Route.history.pushState, 1, null, '/#admin-profile/my/id');
    });

    test("abort page change", ()=>{
      const Baz = {
        name: 'Baz',
        onBaseEntry() {
          Route.abortPage(RootBar, {foo: 123});
        },
        onBaseExit: stub(),
      };

      const RootBar = {
        name: 'RootBar',
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };

      Route.root.addTemplate(RootBar);
      Route.root.addBase(Baz);
      Baz.route.addTemplate(v.FooBar);


      Route.gotoPage(v.FooBar);

      refute.called(v.FooBar.onEntry);
      assert.calledWith(RootBar.onEntry, RootBar, {foo: 123, pathname: '/root-bar'});
    });

    test("abortPage outside of gotoPage", ()=>{
      stub(Route, 'replacePath');

      Route.abortPage(1, 2,3);

      assert.calledWith(Route.replacePath, 1, 2, 3);
    });

    test("push history", ()=>{
      assert.same(Route._orig_history, window.history);

      Route.root.addTemplate(v.FooBar);
      v.FooBar.onEntry = ()=>{Route.title = "foo title"};

      Route.gotoPage(v.FooBar);

      assert.calledWith(Route.history.pushState, 1, null, '/#foo-bar');
      assert.same(document.title, 'foo title');
    });

    test("replace history", ()=>{
      Route.title = "baz bar";
      Route.root.addTemplate(v.FooBar);
      Route.replacePath(v.FooBar);

      assert.calledWith(Route.history.replaceState, 0, null, '/#foo-bar');
      assert.same(Route.pageState, 'pushState');
    });

    test("replacePage passes all args", ()=>{
      /**
       * Like {#.gotoPage} but replaces to `window.history`
       * rather than adding to it.
       **/
      api.method('replacePage');

      const MyPage = Dom.newTemplate({
        name: 'Test.MyPage',
        nodes: [{name: 'div'}]
      });

      Route.root.addTemplate(MyPage);

      stub(Route, 'gotoPage', () => {v.pageState = Route.pageState});

      Route.replacePage(MyPage, {append: 'myId'});

      assert.same(v.pageState, 'replaceState');
      assert.same(Route.pageState, 'pushState');
      assert.calledWith(Route.gotoPage, MyPage, {append: 'myId'});
    });

    test("replacePath passes all args", ()=>{
      stub(Route, 'gotoPath', () => v.pageState = Route.pageState);

      Route.replacePath(1, 2,3);
      assert.same(v.pageState, 'replaceState');
      assert.same(Route.pageState, 'pushState');

      assert.calledWith(Route.gotoPath, 1, 2, 3);
    });

    test("pageChanged", ()=>{
      stub(Route, 'gotoPath');
      Route.root.addTemplate(v.FooBar);
      Route.pageChanged();

      assert.calledWithExactly(Route.gotoPath, TH.match.is(koru.getLocation()));
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
    });

    test("same page pageChanged", ()=>{
      Route.recordHistory(v.FooBar, '/#the/path?is=this#tag');
      stub(koru, 'getLocation').returns({
        origin: 'https://test.com:3012', href: 'https://test.com:3012/#the/path?is=this#tag'});

      stub(Route, 'gotoPath');

      Route.pageChanged();

      refute.called(Route.gotoPath);
    });

    test("replacePage always changes history", ()=>{
      Route.root.addTemplate(v.FooBar);
      Route.gotoPath('/foo-bar');

      Route.history.replaceState.reset();

      Route.replacePath('/foo-bar');

      assert.called(Route.history.replaceState);
    });

    test("root", ()=>{
      assert.same(v.root.constructor, Route);
    });

    test("addBase without defaultPage", ()=>{
      const Baz = {
        name: 'Baz',
        onBaseEntry: stub(),
        onBaseExit: stub(),
      };

      Route.root.addBase(Baz);

      Route.gotoPage(Baz);

      assert.calledWith(Baz.onBaseEntry, Baz, {pathname: '/baz'});
    });

    test("setting parent in addBase", ()=>{
      const Baz = {
        name: 'Baz',
        onBaseEntry: stub(),
        onBaseExit: stub(),
      };

      const BazBar = {
        name: 'BazBar',
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };

      Route.root.routeVar = 'foo';
      after(()=>{Route.root.routeVar = null});
      intercept(Route.root, 'onBaseEntry', v.rootBaseEntry = stub());
      intercept(Route.root, 'onBaseExit', v.rootBaseExit = stub());

      Route.root.addBase(Baz, {parent: void 0});

      Baz.route.addTemplate(BazBar);

      Route.gotoPage(BazBar);

      refute.called(v.rootBaseEntry);
      assert.calledWith(BazBar.onEntry, BazBar, {pathname: 'baz/baz-bar'});

      Route.gotoPage(null);

      refute.called(v.rootBaseExit);
      assert.calledWith(BazBar.onExit, null, {pathname: ''});
    });

    test("noParentRoute", ()=>{
      const BazBar = {
        name: 'BazBar',
        noParentRoute: true,
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };

      intercept(Route.root, 'onBaseEntry', v.rootBaseEntry = stub());
      intercept(Route.root, 'onBaseExit', v.rootBaseExit = stub());

      Route.root.addTemplate(BazBar);

      Route.gotoPath('/baz-bar/foo');

      refute.called(v.rootBaseEntry);
      assert.calledWith(BazBar.onEntry, BazBar, {pathname: '/baz-bar/foo', append: 'foo'});

      Route.gotoPage(null);

      refute.called(v.rootBaseExit);
      assert.calledWith(BazBar.onExit, null, {pathname: ''});


    });

    test("addBase defaults", ()=>{
      const tpl1 = Dom.newTemplate({
        name: 'Test.Tpl1',
        nodes: [{
          name: 'div', children: [
            {name: 'div', attrs: [['=', 'id', 'anchor1']]}
          ]
        }]
      });

      const tpl2 = Dom.newTemplate({
        name: 'Test.Tpl2',
        nodes: [{
          name: 'div', children: [
            {name: 'div', attrs: [['=', 'id', 'anchor2']]}
          ]
        }],
      });

      const tpl3 = Dom.newTemplate({
        name: 'Test.Tpl3',
        nodes: [{name: 'div', children: ["template 1"]}],
      });

      const base1 = Route.root.addBase(module, tpl1, {
        get childAnchor() {
          return document.getElementById('anchor1');
        }
      });
      const base2 = base1.addBase(module, tpl2, {
        get childAnchor() {
          return document.getElementById('anchor2');
        }
      });
      base2.addTemplate(tpl3);

      Route.gotoPage(tpl3);

      assert.dom('#anchor1>div>#anchor2>div', 'template 1');
    });

    test("addBase and addAlias", ()=>{
      const Baz = {
        name: 'Baz',
        onBaseEntry: stub(),
        onBaseExit: stub(),
      };

      const Fnord = {
        name: 'Fnord',
        onBaseEntry: stub(),
        onBaseExit: stub(),
      };

      const BazBar = {
        name: 'Baz',
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };

      const RootBar = {
        name: 'RootBar',
        $autoRender: stub(),
        onEntry: stub(),
        onExit: stub(),
      };

      Route.root.addTemplate(RootBar);

      /** test route options */
      Route.root.addBase(Baz, {foo: 123, path: 'bazpath'});
      assert.same(Baz.route.foo, 123);

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

      const loc = {pathname: "/bazpath/fnord/foo-bar"};

      assert.calledWith(BazBar.onExit, v.FooBar, loc);
      assert.calledWith(v.FooBar.onEntry, v.FooBar, loc);

      assert.calledWith(Fnord.onBaseEntry, v.FooBar, loc);
      refute.called(Baz.onBaseExit);

      Route.gotoPage(RootBar);

      assert.calledWith(Baz.onBaseExit, RootBar, { pathname: "/root-bar" });

      BazBar.onEntry.reset();

      Route.gotoPath('/short-cut/12345');

      assert.calledWith(BazBar.onEntry, BazBar, {append: '12345', pathname: "/bazpath/baz/12345"});
    });

    test("private page", ()=>{
      const origSigninPage = Route.SignInPage;
      Route.SignInPage = "mySign in page";
      after(()=>{Route.SignInPage = origSigninPage});
      stub(Route, 'replacePage');
      koru.userId.restore();

      Route.root.addTemplate(v.FooBar);

      Route.gotoPage(v.FooBar, {myArgs: '123'});

      refute.called(v.FooBar.onEntry);

      assert.calledWith(Route.replacePage, Route.SignInPage, {returnTo: [v.FooBar, {myArgs: '123', pathname: '/foo-bar'}]});
    });

    test("public page", ()=>{
      const origSigninPage = Route.SignInPage;
      Route.SignInPage = "mySign in page";
      after(()=>{Route.SignInPage = origSigninPage});
      stub(Route, 'replacePage');
      koru.userId.restore();

      Route.root.addTemplate(v.FooBar, {publicPage: true});

      Route.gotoPage(v.FooBar, {myArgs: '123'});

      assert.called(v.FooBar.onEntry);

      refute.called(Route.replacePage);
    });

    test("addTemplate with entry/exit", ()=>{
      const Baz = {
        name: 'Baz',

        onEntry: v.onEntry = stub(),
        onExit: v.onExit = stub(),

        $autoRender(arg) {
          return Dom.textToHtml('<div id="Baz">'+arg+'</div>');
        },
      };

      Route.root.addTemplate(Baz);

      Route.root.removeTemplate(Baz);

      // doesn't change onEntry, onExit
      assert.same(Baz.onEntry, v.onEntry);
      assert.same(Baz.onExit, v.onExit);
    });

    test("insertPage function option", ()=>{
      const Baz = {
        name: 'Baz',
        parent: v.FooBar,

        $autoRender() {
          return Dom.h({id: 'Baz'});
        },
      };

      const insertPoint = Dom.h({});

      Route.root.addTemplate(Baz, {
        insertPage(elm) {insertPoint.appendChild(elm)},
        afterRendered(elm, pageRoute) {
          assert.same(elm.parentNode, insertPoint);
          assert.same(pageRoute, v.pageRoute);
          assert.same(this, Baz);

          v.afterRendered = elm;
        },
      });

      Baz.onEntry(Baz, v.pageRoute = {foo: 123});

      assert.dom(insertPoint, function () {
        assert.dom('#Baz', function () {
          assert.same(v.afterRendered, this);
        });
      });

    });

    test("addTemplate", ()=>{
      after(()=>{{Route.childAnchor = document.body}});

      const Baz = {
        name: 'Baz',
        parent: v.FooBar,

        $autoRender(arg) {
          return Dom.h({div: arg, id: "Baz"});
        },
      };

      document.body.appendChild(Route.childAnchor = Dom.h({id: 'the-pageParent'}));

      Route.root.addTemplate(v.FooBar);
      Route.root.addTemplate(Baz, {data() {return 'fooData'}});

      assert.isFunction(Baz.onEntry);

      Baz.onEntry(Baz);

      assert.dom('#the-pageParent>#Baz', 'fooData');

      Baz.onExit(Baz);

      refute.dom('#Baz');

      Route.root.removeTemplate(Baz);

      // removes auto onEntry, onExit
      assert.same(Baz.onEntry, null);
      assert.same(Baz.onExit, null);
    });

    test("gotoPath default", ()=>{
      Route.root.addTemplate(v.FooBar, {path: "foo-location"});
      stub(koru, 'getLocation').returns({pathname: "/foo-location/append-data"});

      Route.gotoPath();
      assert.called(v.FooBar.onEntry);
    });

    test("addDialog gotoPath", ()=>{
      Route.root.addTemplate(v.FooBar);

      const FooDialog = {
        onEntry: stub(),
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

    });

    test("addTemplate gotoPath", ()=>{
      const Bar = {
        name: 'Bar',
        $autoRender: stub(),
        onEntry: stub(),
      };
      Route.root.addTemplate(v.FooBar);
      assert.exception(() => Route.root.addTemplate('foo-bar', v.FooBar));

      Route.root.addTemplate(Bar);

      Route.gotoPath(v.loc = {pathname: '/foo-bar'});

      assert.calledWith(v.FooBar.onEntry, v.FooBar, v.loc);

      v.loc = {pathname: '/bar'};
      Route.gotoPath(v.loc.pathname);

      assert.calledWith(v.FooBar.onExit, Bar, v.loc);
      assert.calledWith(Bar.onEntry, Bar, v.loc);
    });

    test("passing string", ()=>{
      Route.root.defaultPage = v.FooBar;

      Route.gotoPath('/anything?abc=123&def=456#hash');

      assert.calledWith(v.FooBar.onEntry, v.FooBar, {pathname: '', search: '?abc=123&def=456', hash: '#hash'});
    });

    test("passing object", ()=>{
      Route.root.defaultPage = v.FooBar;

      Route.gotoPath({pathname: '/anything', search: '?abc=123&def=456', hash: '#hash'});

      assert.calledWith(v.FooBar.onEntry, v.FooBar, {pathname: '', search: '?abc=123&def=456', hash: '#hash'});
    });
  });
});
