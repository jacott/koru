isServer && define((require, exports, module) => {
  'use strict';
  /**
   * Factory for creating web-servers.
   *
   **/
  const Future          = require('koru/future');
  const koru            = require('koru/main');
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const fst             = require('./fs-tools');
  const IdleCheck       = require('./idle-check').singleton;

  const {stub, spy, intercept, match: m} = TH;

  const WebServerFactory = require('./web-server-factory');

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    let future, req, res, replaceSend, sendRet, webServer, send;
    beforeEach(() => {
      future = new Future();
      req = {
        headers: {},
        on: stub(),
      };
      res = {
        getHeader: stub(),
        setHeader: stub(),
        on: stub(),
        once: stub(),
        emit: stub(),
        write: stub(),
        writeHead: stub(),
        end(data) {
          future.resolve(data);
        },
      };
      webServer = undefined;
      api.module();
    });

    test('construction', () => {
      /**
       * Create a new web server. The npm package
       * [send](https://www.npmjs.com/package/send) is used to serve
       * files.
       *
       * @param root Serve files relative to path.
       **/
      const WebServerFactory = api.custom();

      //[
      const http = requirejs.nodeRequire('http');
      stub(http, 'createServer');
      webServer = WebServerFactory(
        '0.0.0.0', '80', '/rootDir/',
        '/index2.html',
        {gem: (match) => [match[0], '/path-to-gems']});
      assert.calledWith(http.createServer, webServer.requestListener);
      //]
      webServer = WebServerFactory('localhost', '9876', '/');
    });

    test('start', () => {
      webServer = WebServerFactory('localhost', '9876', '/');
      api.protoMethod('start', {subject: webServer});

      //[
      const {Server} = requirejs.nodeRequire('http');
      const listen = stub(Server.prototype, 'listen').yields();

      webServer.start();
      assert.calledWith(listen, '9876', 'localhost');
      //]
    });

    test('stop', () => {
      webServer = WebServerFactory('localhost', '9876', '/');
      api.protoMethod('stop', {subject: webServer});

      //[
      const {Server} = requirejs.nodeRequire('http');
      const close = stub(Server.prototype, 'close');

      webServer.stop();
      assert.called(close);
      //]
    });

    test('parseUrlParams', () => {
      webServer = WebServerFactory('localhost', '9876', '/foo');

      assert.equals(webServer.parseUrlParams('stuff?foo=bar&name=bob'),
        {foo: 'bar', name: 'bob'});
      assert.equals(webServer.parseUrlParams({url: 'stuff?foo=bar'}),
        {foo: 'bar'});
    });

    test('handlers override specials', async () => {
      let future = new Future();
      stub(IdleCheck, 'inc');
      stub(IdleCheck, 'dec', () => future.resolve());

      const req = {url: '/bar/baz'}, res = {end: stub(), writeHead: stub()};
      stub(koru, 'unhandledException');

      let ex;

      webServer = WebServerFactory('localhost', '9876', '/', '', {
        bar() {throw ex = new koru.Error(499, {test: 123})}});

      webServer.requestListener(req, res);
      await future.promise;
      future = new Future();

      refute.called(koru.unhandledException);

      assert.calledWith(res.writeHead, 499);

      const bar = stub();
      webServer.registerHandler(module, 'bar', bar);

      webServer.requestListener(req, res);
      await future.promise;

      assert.called(bar);
    });

    test('transform', async () => {
      webServer = WebServerFactory('localhost', '9876', '/', '', {}, (req, pathname) => {
        if (pathname.endsWith('.js') && ! pathname.endsWith('-server.js') && ! pathname.endsWith('-client.js')) {
          return (send, req, path, opts, res) => {
            res.writeHead('x');
            res.end();
          };
        }
      });

      const future = new Future();

      const req = {url: '/path/file.js?abc=123'}, res = {end() {future.resolve()}, writeHead: stub()};
      webServer.requestListener(req, res);

      await future.promise;

      assert.calledWith(res.writeHead, 'x');
    });

    test('async specials', async () => {
      let future = new Future();
      stub(IdleCheck, 'inc');
      stub(IdleCheck, 'dec', () => future.resolve());
      const req = {url: '/bar/baz1'}, res = {end: stub(), writeHead: stub()};
      stub(koru, 'unhandledException');

      let ex;

      webServer = WebServerFactory('localhost', '9876', '/', '', {
        async bar() {await 1; if (ex) {
          throw ex;
        } else {
          return ['/a/b.test', '/toptest/'];
        }}});

      const sender = {};

      sender.on = stub().returns(sender);
      sender.pipe = stub().returns(sender);

      const send = stub().returns(sender);

      const origSend = webServer.send;
      after(() => {webServer._replaceSend(origSend)});
      webServer._replaceSend(send);

      webServer.requestListener(req, res);

      await future.promise;

      assert.calledWith(send, req, '/a/b.test', {root: '/toptest/', index: false, dotfiles: 'allow'});
      assert.calledWith(sender.on, 'error', m.func);
      assert.calledWith(sender.on, 'directory', m.func);
      assert.calledWith(sender.pipe, res);

      sender.on.yield(new koru.Error(404, 'not found'));

      assert.calledWith(res.writeHead, 404);
      assert.calledWith(res.end, 'not found');

      res.writeHead.reset();
      res.end.reset();

      future = new Future();

      ex = new koru.Error(499, {test: 123});

      webServer.requestListener(req, res);

      await future.promise;

      refute.called(koru.unhandledException);
      assert.calledWith(res.writeHead, 499);
      assert.calledWith(res.end, '{"test":123}');
    });
  });
});
