const fs = require('fs');

isServer && define(function (require, exports, module) {
  /**
   * The default web-server created from {#koru/web-server-factory}.
   * {#koru/idle-check} is used to keep track of active
   * requests.
   *
   * @config host listen on the specified address

   * @config port listen on the specified port

   * @config defaultPage defaults to `/index.html`: used when no path
   * is supplied in the url.

   * @config index.js the file to serve for `index.js` or
   * `require.js`; defaults to `yaajs.js`

   * @config require.js alias for `index.js`

   * @config koru where to find koru files; defaults to `app/koru`
   *
   **/
  var test, v;
  const koru             = require('koru/main');
  const api              = require('koru/test/api');
  const WebServerFactory = require('koru/web-server-factory');
  const fst              = require('./fs-tools');
  const IdleCheck        = require('./idle-check').singleton;
  const TH               = require('./test');
  const webServer        = require('./web-server');
  const Future           = requirejs.nodeRequire('fibers/future');

  TH.testCase(module, {
    setUp() {
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
        writeHead: test.stub(),
        end(data) {
          v.future.return(data);
        },
      };
      v.origSend = webServer.send;

      v.replaceSend = function (func) {
        v.sendRet = {
          pipe(res) {
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

    tearDown() {
      webServer._replaceSend(v.origSend);
      v = null;
    },

    "test not found html"() {
      v.req.url = '/koru/.build/notFound.html.js';

      v.replaceSend();

      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), "NOT FOUND");
      assert.same(v.res.statusCode, 404);
    },

    "test waitIdle"() {
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


    "test compilation no build"() {
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

    "error": {
      setUp() {
        webServer.registerHandler('foo', function (req, res, path, error) {
          v.res.called = true;
          v.req.called = true;
          error(406, v.msg);
        });
        v.req.url = '/foo/bar';
        test.spy(v.res, 'end');
        v.replaceSend();
      },

      tearDown() {
        webServer.deregisterHandler('foo');
      },

      "test string"() {
        v.msg = 'my message';

        webServer.requestListener(v.req, v.res);
        assert.calledWith(v.res.writeHead, 406, {
          'Content-Length': 10,
        });

        assert.calledWith(v.res.end, 'my message');
      },

      "test json"() {
        v.msg = {json: 'object'};

        webServer.requestListener(v.req, v.res);
        assert.calledWith(v.res.end, JSON.stringify(v.msg));
        assert.calledWith(v.res.writeHead, 406, {
          'Content-Type': 'application/json',
          'Content-Length': 17,
        });
      },
    },

    "test usage"() {
      api.module();
      api.method('start');

      const webServerModule = module.ctx.modules['koru/web-server'];

      api.example(() => {
        const {Server} = requirejs.nodeRequire('http');

        const listen = test.stub(Server.prototype, 'listen').yields();
        webServer.start();
        assert.calledWith(listen, webServerModule.config().port);
      });
    },

    "test exception"() {
      test.stub(koru, 'error');
      webServer.registerHandler('foo', function (req, res, path, error) {
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

    "test found html"() {
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
