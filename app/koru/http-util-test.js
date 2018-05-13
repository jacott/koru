isServer && define(function (require, exports, module) {
  const request = requirejs.nodeRequire('request');
  const koru            = require('koru');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test');
  const util            = require('koru/util');

  const {test$} = require('koru/symbols');

  const {stub, spy, onEnd, intercept, match} = TH;

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
        assert.same(error.message, 'Bad Request [403]');
        assert.same(error.statusCode, 403);
        assert.same(error.response, response);
        assert.same(error.body, 'the body');

        error = new sut.HttpError({message: 'foo', statusCode: 418, response});
        assert.same(error.message, 'foo [418]');
        assert.same(error.statusCode, 418);
        assert.same(error.response, response);
        assert.same(error.body, undefined);


        error = new sut.HttpError({statusCode: 418});
        assert.same(error.statusCode, 418);
        assert.same(error.response, undefined);
        assert.same(error.body, undefined);

        error = new sut.HttpError();
        assert.same(error.message, 'Bad Request [400]');
        assert.same(error.statusCode, 400);
        assert.same(error.response, undefined);
        assert.same(error.body, undefined);
      },

      "test timeout"() {
        v.req.yields({message: 'Timeout', code: 'ETIMEDOUT'});
        assert.exception(()=>{sut.request({method: 'HEAD'})}, {
          message: 'Timeout [504]', statusCode: 504});

        assert.calledWith(v.req, {method: 'HEAD', timeout: 20*1000});
      },

      "test ECONNREFUSED"() {
        v.req.yields({message: 'Connection Refused', errno: 'ECONNREFUSED'});
        assert.exception(
          ()=>{sut.request({method: 'PUT', timeout: 12345}, {serverError: 'throw'})},
          {message: 'Connection Refused [503]', statusCode: 503});

        assert.calledWith(v.req, {method: 'PUT', timeout: 12345});

        v.req.reset();

        const ans = sut.request({method: 'PUT', timeout: 12345}, {serverError: 'return'});

        assert.equals(ans.statusCode, 503);
        assert.equals(ans.message, 'Connection Refused');
      },

      "test general error"() {
        v.req.yields(new Error('foo'));
        assert.exception(()=>{sut.request({method: 'HEAD'})}, {message: 'foo [500]', statusCode: 500});
      },

      "test success"() {
        const response = {headers: 'foo', statusCode: 200}, body = 'the body';
        v.req.yields(null, response, body);

        assert.equals(sut.request({method: 'HEAD'}), {statusCode: 200, response, body});
      },

      "test callback"() {
        const response = {headers: 'foo', statusCode: 200}, body = 'the body';
        const callback = stub();

        assert.equals(sut.request({method: 'HEAD'}, callback), undefined);

        assert.calledWith(v.req, {method: 'HEAD', timeout: 20000}, callback);

        refute.called(callback);
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

      "test kill fiber"() {
        const handle = {abort: stub()};
        v.req.returns(handle);
        let fib, ans;
        koru.runFiber(()=>{
          fib = util.Fiber.current;
          ans = sut.request({method: 'HEAD'});
        });

        fib.throwInto('testing 123');

        assert.equals(ans, {interrupt: 'testing 123'});
        assert.called(handle.abort);
      },
    },

    "expBackoff": {
      setUp() {
        let timerHandle = 100;
        stub(koru, 'setTimeout').invokes(call => ++timerHandle);
        stub(koru, 'clearTimeout');
      },

      "test success"() {
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(()=>{
          return {statusCode: 200};
        }, config);


        refute.called(config.onSuccess);

        assert.calledWith(koru.setTimeout, match.func, 0);
        assert.equals(config.timer, 101);
        assert.equals(config.retryCount, 0);


        koru.setTimeout.yieldAndReset();

        refute.called(config.onFailure);

        refute.called(koru.setTimeout);
        refute.called(koru.clearTimeout);
      },

      "test failure"() {
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(()=>{
          throw v.error = new sut.HttpError({statusCode: 400});
        }, config);

        refute.called(config.onFailure);

        koru.setTimeout.yieldAndReset();

        assert.calledWith(config.onFailure, v.error);
        refute.called(config.onSuccess);

        refute.called(koru.setTimeout);
        refute.called(koru.clearTimeout);
      },

      "test retry"() {
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(()=>{
          throw v.error = new sut.HttpError({statusCode: 500});
        }, config);

        assert.same(config.retryCount, 0);
        assert.same(config.timer, 101);

        koru.setTimeout.yieldAndReset();

        refute.called(config.onFailure);
        refute.called(config.onSuccess);

        assert.calledWith(koru.setTimeout, match.func, match.between(30*1000, 40*1000));
        assert.same(config.timer, 102);
        assert.same(config.retryCount, 1);

        config.retryCount = 7;

        config.isRetry = function (ex) {v.ex = ex; v.config = this; return true};
        koru.setTimeout.yieldAndReset();

        assert.equals(v.config, config);
        assert.equals(v.ex.statusCode, 500);

        assert.calledWith(koru.setTimeout, match.func, match.between(3840*1000, (3840+10)*1000));
        koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, match.func, match.between(90*60*1000, (90*60+10)*1000));
        koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, match.func, match.between(90*60*1000, (90*60+10)*1000));

        config.isRetry = () => false;
        koru.setTimeout.yieldAndReset();

        refute.called(koru.setTimeout);
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
