isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Future          = require('koru/future');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');

  const zlib = requirejs.nodeRequire('zlib');

  const {stub, spy, intercept, match: m} = TH;

  const sut = require('./http-util');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    test('HttpError', () => {
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
    });

    group('expBackoff', () => {
      beforeEach(() => {
        let timerHandle = 100;
        stub(koru, 'setTimeout').invokes((call) => ++timerHandle);
        stub(koru, 'clearTimeout');
      });

      test('success', async () => {
        const future = new Future();
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(() => {
          future.resolve();
          return {statusCode: 200};
        }, config);

        refute.called(config.onSuccess);

        assert.calledWith(koru.setTimeout, m.func, 0);
        assert.equals(config.timer, 101);
        assert.equals(config.retryCount, 0);

        koru.setTimeout.yieldAndReset();
        await future.promise;
        await 1;

        refute.called(config.onFailure);

        refute.called(koru.setTimeout);
        refute.called(koru.clearTimeout);

        assert.called(config.onSuccess);
      });

      test('failure', async () => {
        let error;
        const future = new Future();
        const config = {onSuccess: stub(), onFailure: stub((err) => {
          future.resolve(err);
        })};
        sut.expBackoff(() => {
          throw error = new sut.HttpError({statusCode: 400});
        }, config);

        refute.called(config.onFailure);

        koru.setTimeout.yieldAndReset();
        await future.promise;

        assert.calledWith(config.onFailure, error);
        refute.called(config.onSuccess);

        refute.called(koru.setTimeout);
        refute.called(koru.clearTimeout);
      });

      test('retry', async () => {
        let error;
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(() => {
          throw error = new sut.HttpError({statusCode: 500});
        }, config);

        assert.same(config.retryCount, 0);
        assert.same(config.timer, 101);

        koru.setTimeout.yieldAndReset();
        for (let i = 0; i < 4; ++i) await 1;

        refute.called(config.onFailure);
        refute.called(config.onSuccess);

        assert.calledWith(koru.setTimeout, m.func, m.between(30*1000, 40*1000));
        assert.same(config.timer, 102);
        assert.same(config.retryCount, 1);

        config.retryCount = 7;

        let exResult, configResult;
        config.isRetry = function (ex) {exResult = ex; configResult = this; return true}
        koru.setTimeout.yieldAndReset();
        for (let i = 0; i < 4; ++i) await 1;

        assert.equals(configResult, config);
        assert.equals(exResult.statusCode, 500);

        assert.calledWith(koru.setTimeout, m.func, m.between(3840*1000, (3840+10) * 1000));

        koru.setTimeout.yieldAndReset();
        for (let i = 0; i < 4; ++i) await 1;

        assert.calledWith(koru.setTimeout, m.func, m.between(90*60*1000, (90*60 + 10) * 1000));

        koru.setTimeout.yieldAndReset();
        for (let i = 0; i < 4; ++i) await 1;

        assert.calledWith(koru.setTimeout, m.func, m.between(90*60*1000, (90*60 + 10) * 1000));

        config.isRetry = () => false;
        koru.setTimeout.yieldAndReset();
        for (let i = 0; i < 4; ++i) await 1;

        refute.called(koru.setTimeout);
      });
    });

    group('body', () => {
      test('readBody json', async () => {
        const rawBody = {myBody: 'json🐧'}; // 🐧 to test default encoding

        assert.equals(await sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
          },
        }, rawBody)), rawBody);

        assert.equals(await sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'text/html;charset=UTF-8',
          },
        }, rawBody), {asJson: true}), rawBody);

        refute.equals(await sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
          },
        }, rawBody), {encoding: 'binary'}), rawBody);

        assert.equals(await sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'text;charset=UTF-8',
          },
        }, rawBody)), JSON.stringify(rawBody));

        try {
          await sut.readBody(new HttpHelper.RequestStub({
            url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
            method: 'GET',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
            },
          }, 'junk'));
          assert.fail('expect throw');
        } catch (err) {
          assert.exception(err, {error: 400, reason: 'request body must be valid JSON'});
        }
      });

      test('readBody limit', async () => {
        const rawBody = {myBody: 'json'};

        try {
          await sut.readBody(new HttpHelper.RequestStub({
            url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
            method: 'GET',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
            },
          }, rawBody), {limit: 4});
        } catch (err) {
          assert.exception(err, {error: 413, reason: 'request body too large'});
        }
      });

      class MyReq extends HttpHelper.RequestStub {
        _read() {
          if (this._input === '') {
            this.push(null);
          } else {
            const buf = this._input;
            this._input = '';
            this.push(buf);
          }
        }
      }

      test('gzip', async () => {
        const exp = {myBody: 'json'};
        const req = new MyReq({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'content-encoding': 'gzip',
          },
        }, zlib.gzipSync(JSON.stringify(exp)));
        assert.equals(await sut.readBody(req), exp);
      });
    });

    group('renderContent', () => {
      test('render json', () => {
        let v = {};
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {data: {foo: 123}});
        assert.equals(v.output, [JSON.stringify({foo: 123})]);
        assert.calledWith(res.writeHead, 200, {
          'Content-Length': 11, 'Content-Type': 'application/json; charset=utf-8'});
        assert.isTrue(v.ended);
      });

      test('render none', () => {
        let v = {};
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {});
        assert.equals(v.output, ['']);
        assert.calledWith(res.writeHead, 204, {
          'Content-Length': 0});
        assert.isTrue(v.ended);
      });

      test('render custom', () => {
        let v = {};
        const res = HttpHelper.makeResponse(v);
        sut.renderContent(res, {
          contentType: 'custom',
          prefix: 'my prefix', data: 'the data', endcoding: 'binary',
        });
        assert.equals(v.output, ['my prefix', 'the data']);
        assert.calledWith(res.writeHead, 200, {
          'Content-Length': 17, 'Content-Type': 'custom; charset=utf-8'});
        assert.isTrue(v.ended);
      });
    });
  });
});
