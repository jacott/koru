isServer && define(function (require, exports, module) {
  const request = requirejs.nodeRequire('request');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test');
  const util            = require('koru/util');

  const {test$} = require('koru/symbols');

  const {stub, spy, onEnd, intercept} = TH;

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

      "test throw opts"() {
        assert.equals(sut.THROW_5XX, {serverError: 'throw'});
        assert.equals(sut.THROW_NONE, {});
        assert.equals(sut.THROW_ERROR, {serverError: 'throw', clientError: 'throw'});
        assert.equals(sut.THROW_ERROR_NOT_404, {
          serverError: 'throw', clientError: 'throw', 404: 'return'});
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
          ()=>{sut.request({method: 'PUT', timeout: 12345}, {serverError: 'throw'})},
          {message: 'Connection Refused', statusCode: 503});

        assert.calledWith(v.req, {method: 'PUT', timeout: 12345});

        v.req.reset();

        const ans = sut.request({method: 'PUT', timeout: 12345}, {serverError: 'return'});

        assert.equals(ans.statusCode, 503);
        assert.equals(ans.message, 'Connection Refused');
      },

      "test general error"() {
        v.req.yields(new Error('foo'));
        assert.exception(()=>{sut.request({method: 'HEAD'})}, {message: 'foo', statusCode: 500});
      },

      "test success"() {
        const response = {headers: 'foo', statusCode: 200}, body = 'the body';
        v.req.yields(null, response, body);

        assert.equals(sut.request({method: 'HEAD'}), {statusCode: 200, response, body});
      },

      "test return 404, else throw"() {
        const response = {headers: 'foo', statusCode: 404}, body = 'the body';
        v.req.yields(null, response, body);

        const throw404 = {404: 'return', clientError: 'throw'};

        assert.equals(sut.request({method: 'HEAD'}), {statusCode: 404, response, body});
        assert.equals(sut.request({method: 'HEAD'}, throw404),
                      {statusCode: 404, response, body});

        response.statusCode = 409;
        assert.equals(sut.request({method: 'HEAD'}), {statusCode: 409, response, body});
        assert.exception(()=>{
          sut.request({method: 'HEAD'}, throw404);
        }, {statusCode: 409});
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
