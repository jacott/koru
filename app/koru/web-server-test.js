var Future = require('fibers/future');

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
    },

    tearDown: function () {
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

      webServer.requestListener(v.req, v.res);

      assert.same(v.future.wait(), undefined);
      assert.calledWith(v.res.write, TH.match(function (data) {
        return data.toString() === 'define({"name":"Test.WebServer","nodes":[{"name":"div","attrs":[],"children":[["","hello"]]}]})';
      }));

      assert.calledWith(v.res.setHeader, 'Content-Type', 'application/javascript');
    },
  });
});
