const Future = requirejs.nodeRequire('fibers/future');
const fs = require('fs');

isServer && define(function (require, exports, module) {
  /**
   * Factory for creating web-servers.
   *
   **/
  const koru             = require('koru/main');
  const api              = require('koru/test/api');
  const fst              = require('./fs-tools');
  const IdleCheck        = require('./idle-check').singleton;
  const TH               = require('./test');

  const {stub, spy, onEnd, intercept} = TH;

  const WebServerFactory = require('./web-server-factory');
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
      v.replaceSend = function (func) {
        v.sendRet = {
          pipe(res) {
            v.future.return(res);
          },
        };

        v.sendRet.on = stub().returns(v.sendRet);

        intercept(v.webServer, '_replaceSend', v.send = function (...args) {
          func && func.apply(this, args);
          return v.sendRet;
        });
      };
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test construction"() {
      /**
       * Create a new web server. The npm package
       * [send](https://www.npmjs.com/package/send) is used to serve
       * files.
       *
       * @param root Serve files relative to path.
       **/
      const WebServerFactory = api.new();

      api.example(() => {
        const http = requirejs.nodeRequire('http');
        stub(http, 'createServer');
        v.webServer = WebServerFactory(
          '0.0.0.0', '80', '/rootDir/',
          '/index2.html',
          {gem(match) {return [match[0], '/path-to-gems']}});
        assert.calledWith(http.createServer, v.webServer.requestListener);
      });
      v.webServer = WebServerFactory('localhost', '9876', '/');
    },

    "test start"() {
      v.webServer = WebServerFactory('localhost', '9876', '/');
      api.protoMethod('start', v.webServer);

      api.example(() => {
        const {Server} = requirejs.nodeRequire('http');
        const listen = stub(Server.prototype, 'listen').yields();

        v.webServer.start();
        assert.calledWith(listen, '9876', 'localhost');
      });
    },

    "test stop"() {
      v.webServer = WebServerFactory('localhost', '9876', '/');
      api.protoMethod('stop', v.webServer);

      api.example(() => {
        const {Server} = requirejs.nodeRequire('http');
        const close = stub(Server.prototype, 'close');

        v.webServer.stop();
        assert.called(close);
      });
    },

    "test parseUrlParams"() {
      v.webServer = WebServerFactory('localhost', '9876', '/foo');


      assert.equals(v.webServer.parseUrlParams('stuff?foo=bar&name=bob'), {foo: 'bar', name: 'bob'});
      assert.equals(v.webServer.parseUrlParams({url: 'stuff?foo=bar'}), {foo: 'bar'});
    },

    "test handlers override specials"() {
      intercept(koru, 'runFiber', func => func());
      const req = {url: '/bar/baz'}, res = {end: stub(), writeHead: stub()};
      stub(koru, 'unhandledException');

      v.webServer = WebServerFactory('localhost', '9876', '/', '', {
        bar() {throw v.ex = new koru.Error(499, {test: 123})}});

      v.webServer.requestListener(req, res);

      refute.called(koru.unhandledException);

      const bar = stub();
      v.webServer.registerHandler(module, 'bar', bar);

      v.webServer.requestListener(req, res);

      assert.called(bar);
    },
  });
});
