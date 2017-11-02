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
  const Compilers       = require('koru/compilers');
  const koru            = require('koru/main');
  const api             = require('koru/test/api');
  const WebServerFactory = require('koru/web-server-factory');
  const fst             = require('./fs-tools');
  const IdleCheck       = require('./idle-check').singleton;
  const TH              = require('./test');

  const {stub, spy, onEnd} = TH;

  const Future           = requirejs.nodeRequire('fibers/future');

  const webServer        = require('./web-server');
  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
      v.future = new Future();
      v.req = {
        headers: {},
        on: stub(),
      };
      v.res = {
        getHeader: stub(),
        setHeader: stub(),
        on: stub(),
        once: stub(),
        emit: stub(),
        write: stub(),
        writeHead: stub(),
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

        v.sendRet.on = stub().returns(v.sendRet);

        webServer._replaceSend(v.send = function (...args) {
          func && func.apply(this, args);
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
      onEnd(function () {webServer.deregisterHandler('foox')});

      v.req.url = '/foox/bar';
      spy(IdleCheck, 'inc');
      spy(IdleCheck, 'dec');

      v.replaceSend();

      webServer.requestListener(v.req, v.res);
      assert.same(v.future.wait(), 'success');
      assert.called(IdleCheck.dec);
    },


    "test compilation no build"() {
      stub(fst, 'stat').withArgs(TH.match(/web-server-test\.foo$/)).returns({mtime: 1243});
      stub(fst, 'mkdir');
      const foo = stub();
      Compilers.set('foo', foo);
      onEnd(()=>{Compilers.set('foo', undefined)});

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
        spy(v.res, 'end');
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
      api.module(module.get('./web-server'));
      api.method('start');

      const webServerModule = module.ctx.modules['koru/web-server'];

      api.example(() => {
        const {Server} = requirejs.nodeRequire('http');

        const listen = stub(Server.prototype, 'listen').yields();
        webServer.start();
        assert.calledWith(listen, webServerModule.config().port);
      });
    },

    "test DEFAULT handler"() {
      onEnd(_=>{webServer.deregisterHandler('DEFAULT')});
      webServer.registerHandler('DEFAULT', v.stub = stub());

      v.req.url = '/foo/bar';
      v.replaceSend();
      webServer.requestListener(v.req, v.res);

      assert.calledWith(v.stub, v.req, v.res, '/foo/bar', TH.match.func);
    },

    "test exception"() {
      stub(koru, 'error');
      webServer.registerHandler('foo', (req, res, path, error)=>{
        v.res.called = true;
        v.req.called = true;
        throw new Error("Foo");
      });
      onEnd(()=>{webServer.deregisterHandler('foo')});

      v.req.url = '/foo/bar';

      spy(v.res, 'end');

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
