var Future = requirejs.nodeRequire('fibers/future');
var fs = require('fs');

isServer && define(function (require, exports, module) {
  /**
   * Factory for creating web-servers.
   *
   **/
  var test, v;
  const koru             = require('koru/main');
  const api              = require('koru/test/api');
  const fst              = require('./fs-tools');
  const IdleCheck        = require('./idle-check').singleton;
  const TH               = require('./test');
  const WebServerFactory = require('./web-server-factory');

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
      v.replaceSend = function (func) {
        v.sendRet = {
          pipe(res) {
            v.future.return(res);
          },
        };

        v.sendRet.on = test.stub().returns(v.sendRet);

        test.intercept(v.webServer, '_replaceSend', v.send = function () {
          func && func.apply(this, arguments);
          return v.sendRet;
        });
      };
      api.module(WebServerFactory, 'WebServerFactory');
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
        test.stub(http, 'createServer');
        v.webServer = WebServerFactory('0.0.0.0', '80', '/rootDir/',
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
        const listen = test.stub(Server.prototype, 'listen').yields();

        v.webServer.start();
        assert.calledWith(listen, '9876', 'localhost');
      });
    },

    "test stop"() {
      v.webServer = WebServerFactory('localhost', '9876', '/');
      api.protoMethod('stop', v.webServer);

      api.example(() => {
        const {Server} = requirejs.nodeRequire('http');
        const close = test.stub(Server.prototype, 'close');

        v.webServer.stop();
        assert.called(close);
      });
    },

    "test parseUrlParams"() {
      v.webServer = WebServerFactory('localhost', '9876', '/foo');


      assert.equals(v.webServer.parseUrlParams('stuff?foo=bar&name=bob'), {foo: 'bar', name: 'bob'});
      assert.equals(v.webServer.parseUrlParams({url: 'stuff?foo=bar'}), {foo: 'bar'});
    },
  });
});
