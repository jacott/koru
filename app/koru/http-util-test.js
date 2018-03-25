isServer && define(function (require, exports, module) {
  const request = requirejs.nodeRequire('request');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test');

  const {test$} = require('koru/symbols');

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

    "request": {
      setUp() {
        v = {};
        v.orig = sut[test$].request;
        v.req = stub();
        sut[test$].request = v.req;
      },

      tearDown() {
        sut[test$].request = v.orig;
        v = null;
      },

      "test setup"() {
        assert.same(v.orig, request);
      },

      "test HttpError"() {
        let response = {statusCode: 403};
        let error = new sut.HttpError({response, body: 'the body'});
        assert.same(error.message, 'Bad Request');
        assert.same(error.statusCode, 403);
        assert.same(error.response, response);
        assert.same(error.body, 'the body');

        error = new sut.HttpError({message: 'foo', statusCode: 418, response});
        assert.same(error.message, 'foo');
        assert.same(error.statusCode, 418);
        assert.same(error.response, response);
        assert.same(error.body, undefined);


        error = new sut.HttpError({statusCode: 418});
        assert.same(error.statusCode, 418);
        assert.same(error.response, undefined);
        assert.same(error.body, undefined);

        error = new sut.HttpError();
        assert.same(error.message, 'Bad Request');
        assert.same(error.statusCode, 400);
        assert.same(error.response, undefined);
        assert.same(error.body, undefined);
      },

      "test timeout"() {
        v.req.yields({message: 'Timeout', code: 'ETIMEDOUT'});
        assert.exception(()=>{sut.request({method: 'HEAD'})}, {message: 'Timeout', statusCode: 504});

        assert.calledWith(v.req, {method: 'HEAD', timeout: 20*1000});
      },

      "test ECONNREFUSED"() {
        v.req.yields({message: 'Connection Refused', errno: 'ECONNREFUSED'});
        assert.exception(
          ()=>{sut.request({method: 'PUT', timeout: 12345})},
          {message: 'Connection Refused', statusCode: 503});

        assert.calledWith(v.req, {method: 'PUT', timeout: 12345});
      },

      "test general error"() {
        v.req.yields(new Error('foo'));
        assert.exception(()=>{sut.request({method: 'HEAD'})}, {message: 'foo', statusCode: 500});
      },

      "test success"() {
        const response = {headers: 'foo'}, body = 'the body';
        v.req.yields(null, response, body);

        assert.equals(sut.request({method: 'HEAD'}), {response, body});
      },

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
