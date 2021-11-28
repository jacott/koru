isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const HttpHelper      = require('koru/http-helper');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const zlib            = requirejs.nodeRequire('zlib');

  const {stub, spy, intercept, match} = TH;

  const sut = require('./http-util');

  TH.testCase(module, ({beforeEach, afterEach, group, test}) => {
    group('expBackoff', () => {
      beforeEach(() => {
        let timerHandle = 100;
        stub(koru, 'setTimeout').invokes((call) => ++timerHandle);
        stub(koru, 'clearTimeout');
      });

      test('success', () => {
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(() => {
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
      });

      test('failure', () => {
        let error;
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(() => {
          throw error = new sut.HttpError({statusCode: 400});
        }, config);

        refute.called(config.onFailure);

        koru.setTimeout.yieldAndReset();

        assert.calledWith(config.onFailure, error);
        refute.called(config.onSuccess);

        refute.called(koru.setTimeout);
        refute.called(koru.clearTimeout);
      });

      test('retry', () => {
        let error;
        const config = {onSuccess: stub(), onFailure: stub()};
        sut.expBackoff(() => {
          throw error = new sut.HttpError({statusCode: 500});
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

        let exResult, configResult;
        config.isRetry = function (ex) {exResult = ex; configResult = this; return true}
        koru.setTimeout.yieldAndReset();

        assert.equals(configResult, config);
        assert.equals(exResult.statusCode, 500);

        assert.calledWith(koru.setTimeout, match.func, match.between(3840*1000, (3840+10) * 1000));
        koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, match.func, match.between(90*60*1000, (90*60 + 10) * 1000));
        koru.setTimeout.yieldAndReset();
        assert.calledWith(koru.setTimeout, match.func, match.between(90*60*1000, (90*60 + 10) * 1000));

        config.isRetry = () => false;
        koru.setTimeout.yieldAndReset();

        refute.called(koru.setTimeout);
      });
    });

    group('body', () => {
      test('getBody json', () => {
        const rawBody = {myBody: 'json🐧'}; // 🐧 to test default encoding

        assert.equals(sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
          },
        }, rawBody)), rawBody);

        assert.equals(sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'text/html;charset=UTF-8',
          },
        }, rawBody), {asJson: true}), rawBody);

        refute.equals(sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
          },
        }, rawBody), {encoding: 'binary'}), rawBody);

        assert.equals(sut.readBody(new HttpHelper.RequestStub({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'text;charset=UTF-8',
          },
        }, rawBody)), JSON.stringify(rawBody));

        assert.exception(() => {
          sut.readBody(new HttpHelper.RequestStub({
            url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
            method: 'GET',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
            },
          }, 'junk'));
        }, {error: 400, reason: 'request body must be valid JSON'});
      });

      test('getBody limit', () => {
        const rawBody = {myBody: 'json'};

        assert.exception(() => {
          sut.readBody(new HttpHelper.RequestStub({
            url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
            method: 'GET',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
            },
          }, rawBody), {limit: 4});
        }, {error: 413, reason: 'request body too large'});
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

      test('gzip', () => {
        const exp = {myBody: 'json'};
        const req = new MyReq({
          url: '/rest/2/sch00/foo/123/456?bar=abc&baz=123',
          method: 'GET',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'content-encoding': 'gzip',
          },
        }, zlib.gzipSync(JSON.stringify(exp)));
        assert.equals(sut.readBody(req), exp);
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
