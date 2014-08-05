var Future = require('fibers/future');
var fs = require('fs');

isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var webServer = require('./web-server');

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
    },

    tearDown: function () {
      webServer._replaceSend(v.orgSend);
      v = null;
    },

    "test not found html": function () {
      v.req.url = '/koru/.build/notFound.html.js';

      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), "NOT FOUND");
      assert.same(v.res.statusCode, 404);
    },

    "test found html": function () {
      v.req.url = '/koru/.build/web-server-test.html.js';

      v.sendRet = {
        pipe: function (res) {
          v.future.return(res);
        },
      };

      v.sendRet.on = test.stub().returns(v.sendRet);

      webServer._replaceSend(v.send = function (req, path, options) {
        assert.same(req, v.req);

        assert.same(fs.readFileSync(options.root + path).toString(),
                    'define({"name":"Test.WebServer","nodes":[{"name":"div","attrs":[],"children":[["","hello"]]}]})');

        return v.sendRet;
      });
      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), v.res);

      assert.calledWith(v.sendRet.on, 'error', TH.match.func);
      assert.calledWith(v.sendRet.on, 'directory', TH.match.func);
    },
  });
});
