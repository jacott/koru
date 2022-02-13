isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const http            = requirejs.nodeRequire('http');
  const https           = requirejs.nodeRequire('https');

  const {stub, spy, intercept, match: m} = TH;

  const HttpJson = require('./http-json');

  const {http: origHttp, https: origHttps} = HttpJson[isTest];

  TH.testCase(module, ({beforeEach, afterEach, after, group, test}) => {
    let httpsStub, httpStub, req;

    const requestWrap = (...args) => {
      return new Promise((resolve, reject) => {
        koru.runFiber(() => {
          try {
            resolve(HttpJson.request(...args));
          } catch (err) {reject(err)}
        });
      });
    };

    beforeEach(() => {
      req = {end: stub(), destroy: stub(), on: stub(), setTimeout: stub()};
      httpStub = HttpJson[isTest].http = {request: stub().returns(req)};
      httpsStub = HttpJson[isTest].https = {request: stub().returns(req)};
    });

    afterEach(() => {
      HttpJson[isTest].http = origHttp;
      HttpJson[isTest].https = origHttps;
    });

    test('override content-type', () => {
      httpStub.request.throws('stop');
      try {
        HttpJson.request({url: 'http://example.com', headers: {'Content-Type': 'mytype'}});
      } catch (ex) {}
      assert.calledWith(httpStub.request, 'http://example.com', {
        method: 'GET',
        headers: {'Content-Type': 'mytype', 'Content-Length': 0},
        timeout: 20000,
      });
    });

    test('throw opts', () => {
      assert.equals(HttpJson.THROW_5XX, {serverError: 'throw'});
      assert.equals(HttpJson.THROW_NONE, {});
      assert.equals(HttpJson.THROW_ERROR, {serverError: 'throw', clientError: 'throw'});
      assert.equals(HttpJson.THROW_ERROR_NOT_404, {
        serverError: 'throw', clientError: 'throw', 404: 'return'});
    });

    test('setup', () => {
      assert.same(origHttps, https);
      assert.same(origHttp, http);
    });

    group('errors', () => {
      test('throw ECONNREFUSED', async () => {
        const onError = req.on.withArgs('error');

        let promise = requestWrap({method: 'HEAD', url: 'http://locahost::3000'});

        assert.called(onError);
        onError.yield({code: 'ECONNREFUSED'});

        try {
          await promise;
          assert.fail('exception not thrown');
        } catch (err) {
          assert.exception(err, {message: 'Connection Refused [503]', statusCode: 503});
        }
      });

      test('return ECONNREFUSED', async () => {
        const onError = req.on.withArgs('error');

        let promise = requestWrap({method: 'HEAD', url: 'http://locahost::3000'}, {serverError: 'return'});
        assert.called(onError);

        onError.yield({code: 'ECONNREFUSED'});

        assert.equals(await promise, {message: 'Connection Refused', statusCode: 503});
      });

      test('general error', async () => {
        const onError = req.on.withArgs('error');

        let promise = requestWrap({method: 'HEAD', url: 'http://locahost::3000'});

        assert.called(onError);
        onError.yield(new Error('foo'));
        try {
          await promise;
          assert.fail('exception not thrown');
        } catch (err) {
          assert.exception(err, {message: 'foo [500]', statusCode: 500});
        }
      });

      test('timeout', async () => {
        const onError = req.on.withArgs('error');
        let promise = requestWrap({method: 'HEAD', url: 'http://locahost::3000', timeout: 21234});

        assert.calledWith(onError, 'error', m.func);

        assert.calledOnceWith(req.setTimeout, 21234, m.func);

        req.setTimeout.yield();
        assert.calledWith(req.destroy, {code: 'ETIMEDOUT', message: 'Timeout'});

        onError.yield({code: 'ETIMEDOUT', message: 'Timeout'});

        try {
          await promise;
          assert.fail('exception not thrown');
        } catch (err) {
          assert.exception(err, {message: 'Timeout [504]', statusCode: 504});
        }
      });
    });

    test('success https', async () => {
      let promise = requestWrap({method: 'GET', url: 'https://locahost::3000'});

      assert.calledWith(httpsStub.request, 'https://locahost::3000', {
        method: 'GET',
        headers: {'Content-Type': 'application/json', 'Content-Length': 0},
        timeout: 20000,
      }, m.func);

      const res = {statusCode: 200, headers: {'content-type': 'application/json'}, on: stub()};
      const onData = res.on.withArgs('data');
      const onEnd = res.on.withArgs('end');
      httpsStub.request.yield(res);

      onData.yield('{"a"');
      onData.yield(':123}');

      onEnd.yield();

      const ans = await promise;
      assert.equals(ans.statusCode, 200);
      assert.equals(ans.body, {a: 123});
      assert.same(ans.response, res);
    });

    test('response too large', async () => {
      let promise = requestWrap({method: 'GET', url: 'http://locahost::3000', maxContentSize: 3});

      assert.calledWith(httpStub.request, 'http://locahost::3000', {
        method: 'GET',
        headers: {'Content-Type': 'application/json', 'Content-Length': 0},
        timeout: 20000,
      }, m.func);

      const res = {statusCode: 200, headers: {'content-type': 'application/json'}, on: stub()};
      const onData = res.on.withArgs('data');
      const onEnd = res.on.withArgs('end');
      httpStub.request.yield(res);

      onData.yield('{"a"');
      onData.yield(':123}');

      assert.equals(await promise, {statusCode: 400, message: 'Response too large'});
    });

    test('send body', () => {
      let future = requestWrap({method: 'POST', url: 'http://locahost::3000', body: {a: 123}});

      assert.calledWith(httpStub.request, 'http://locahost::3000', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Content-Length': 9},
        timeout: 20000,
      }, m.func);

      assert.calledWith(req.end, '{"a":123}');
    });

    test('return 404, else throw', async () => {
      const response = {statusCode: 404, headers: {}, on: void 0};
      const testResponse = (type) => {
        httpStub.request.reset();
        let promise = requestWrap({method: 'POST', url: 'http://locahost::3000'}, type);

        response.on = stub();
        const onEnd = response.on.withArgs('end');
        httpStub.request.yield(response);

        onEnd.yield();

        return promise;
      };

      const ret404 = {404: 'return', clientError: 'throw'};

      assert.equals(await testResponse(), {statusCode: 404, response, body: ''});
      assert.equals(await testResponse(ret404), {statusCode: 404, response, body: ''});

      response.statusCode = 409;
      assert.equals(await testResponse(), {statusCode: 409, response, body: ''});

      try {
        await testResponse(ret404);
        assert.fail('exception not thrown');
      } catch (err) {
        assert.exception(err, {statusCode: 409});
      }
    });
  });
});
