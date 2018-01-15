isServer && define(function (require, exports, module) {
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('./test');

  const {stub, spy, onEnd, util} = TH;

  const sut  = require('./http-util');
  let v = null;

  TH.testCase(module, {
    setUp() {
      v = {};
    },

    tearDown() {
      v = null;
    },

    "test readBody"() {
      const rawBody = {myBody: 'json'};

      assert.equals(sut.readBody(new HttpHelper.RequestStub({
        url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
        method: "GET",
        headers: {
          'content-type': "application/json;charset=UTF-8"
        },
      }, rawBody)), rawBody);

      assert.equals(sut.readBody(new HttpHelper.RequestStub({
        url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
        method: "GET",
        headers: {
          'content-type': "text;charset=UTF-8"
        },
      }, rawBody)), JSON.stringify(rawBody));

      assert.exception(()=>{
        sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: "GET",
          headers: {
            'content-type': "application/json;charset=UTF-8"
          },
        }, "junk"));
      }, {error: 400, reason: 'request body must be valid JSON'});
    },
  });
});
