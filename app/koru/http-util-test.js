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

    "renderContent": {
      "test render json"() {
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {data: {foo: 123}});
        assert.equals(v.output, [JSON.stringify({foo: 123})]);
        assert.calledWith(res.writeHead, 200, {
          'Content-Length': 11, 'Content-Type': 'application/json; charset=utf-8'});
        assert.isTrue(v.ended);
      },

      "test render none"() {
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {});
        assert.equals(v.output, ['']);
        assert.calledWith(res.writeHead, 204, {
          'Content-Length': 0});
        assert.isTrue(v.ended);
      },

      "test render custom"() {
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {
          contentType: 'custom',
          prefix: "my prefix", data: "the data", endcoding: 'binary',
        });
        assert.equals(v.output, ['my prefix', 'the data']);
        assert.calledWith(res.writeHead, 200, {
          'Content-Length': 17, 'Content-Type': 'custom; charset=utf-8'});
        assert.isTrue(v.ended);
      },
    },
  });
});
