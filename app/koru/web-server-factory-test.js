var Future = requirejs.nodeRequire('fibers/future');
var fs = require('fs');

isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var WebServerFactory = require('./web-server-factory');
  var koru = require('koru/main');
  var fst = require('./fs-tools');
  var IdleCheck = require('./idle-check').singleton;

  var webServer;

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
        writeHead: test.stub(),
        end: function (data) {
          v.future.return(data);
        },
      };
      v.replaceSend = function (func) {
        v.sendRet = {
          pipe: function (res) {
            v.future.return(res);
          },
        };

        v.sendRet.on = test.stub().returns(v.sendRet);

        test.intercept(webServer, '_replaceSend', v.send = function () {
          func && func.apply(this, arguments);
          return v.sendRet;
        });
      };
      webServer = WebServerFactory('localhost', '9876', '/foo');
    },

    tearDown: function () {
      webServer = v = null;
    },

    "test parseUrlParams": function () {
      assert.equals(webServer.parseUrlParams('stuff?foo=bar&name=bob'), {foo: 'bar', name: 'bob'});
      assert.equals(webServer.parseUrlParams({url: 'stuff?foo=bar'}), {foo: 'bar'});
    },
  });
});
