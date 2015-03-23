var Future = require('fibers/future');
var fs = require('fs');

isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var webServer = require('./web-server');
  var koru = require('koru/main');
  var fst = require('./fs-tools');
  var IdleCheck = require('./idle-check').singleton;

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.future = new Future();
      v.req = {
        headers: {},
        on: test.stub(),
      };
      v.res = {
        getHeader: test.stub(),
        setHeader: test.stub(),
        on: test.stub(),
        once: test.stub(),
        emit: test.stub(),
        write: test.stub(),
        end: function (data) {
          v.future.return(data);
        },
      };
      v.origSend = webServer.send;

      v.replaceSend = function (func) {
        v.sendRet = {
          pipe: function (res) {
            v.future.return(res);
          },
        };

        v.sendRet.on = test.stub().returns(v.sendRet);

        webServer._replaceSend(v.send = function () {
          func && func.apply(this, arguments);
          return v.sendRet;
        });
      };
    },

    tearDown: function () {
      webServer._replaceSend(v.origSend);
      v = null;
    },

    "test parseUrlParams": function () {
      assert.equals(webServer.parseUrlParams('stuff?foo=bar&name=bob'), {foo: 'bar', name: 'bob'});
      assert.equals(webServer.parseUrlParams({url: 'stuff?foo=bar'}), {foo: 'bar'});
    },

    "test not found html": function () {
      v.req.url = '/koru/.build/notFound.html.js';

      v.replaceSend();

      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), "NOT FOUND");
      assert.same(v.res.statusCode, 404);
    },

    "test waitIdle": function () {
      webServer.registerHandler('foox', function (req, res, error) {
        assert.called(IdleCheck.inc);
        refute.called(IdleCheck.dec);
        IdleCheck.waitIdle(function () {
          v.res.end('success');
        });
      });
      test.onEnd(function () {webServer.deregisterHandler('foox')});

      v.req.url = '/foox/bar';
      test.spy(IdleCheck, 'inc');
      test.spy(IdleCheck, 'dec');

      v.replaceSend();

      webServer.requestListener(v.req, v.res);
      assert.same(v.future.wait(), 'success');
      assert.called(IdleCheck.dec);
    },


    "test compilation no build": function () {
      test.stub(fst, 'stat').withArgs(TH.match(/web-server-test\.foo$/)).returns({mtime: 1243});
      test.stub(fst, 'mkdir');
      var foo = webServer.compilers.foo = test.stub();
      test.onEnd(function () {
        delete webServer.compilers.foo;
      });

      v.req.url = '/koru/.build/web-server-test.foo.bar';

      v.replaceSend();

      webServer.requestListener(v.req, v.res);

      assert.calledWith(fst.mkdir, koru.appDir+"/koru/.build");

      assert.calledWith(foo, 'foo', koru.appDir+"/koru/web-server-test.foo",
                        koru.appDir+"/koru/.build/web-server-test.foo.bar");
    },

    "test exception": function () {
      test.stub(koru, 'error');
      webServer.registerHandler('foo', function (req, res, error) {
        v.res.called = true;
        v.req.called = true;
        throw new Error("Foo");
      });

      test.onEnd(function () {
        webServer.deregisterHandler('foo');
      });

      v.req.url = '/foo/bar';

      test.spy(v.res, 'end');

      v.replaceSend();

      webServer.requestListener(v.req, v.res);

      assert.same(v.res.statusCode, 500);
      assert.calledWith(v.res.end, 'Internal server error!');

      assert.isTrue(v.res.called);
      assert.isTrue(v.req.called);
    },

    "test found html": function () {
      v.req.url = '/koru/.build/web-server-test.html.js';

      v.replaceSend(function (req, path, options) {
        assert.same(req, v.req);

        assert.same(fs.readFileSync(options.root + path).toString(),
                    'define({"name":"Test.WebServer","nodes":[{"name":"div","attrs":[],"children":[["","hello"]]}]})');
      });

      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), v.res);

      assert.calledWith(v.sendRet.on, 'error', TH.match.func);
      assert.calledWith(v.sendRet.on, 'directory', TH.match.func);
    },
  });
});
