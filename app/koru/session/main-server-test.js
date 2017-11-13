isServer && define(function (require, exports, module) {
  const Conn    = require('koru/session/server-connection-factory').Base;
  const koru    = require('../main');
  const util    = require('../util');
  const session = require('./main');
  const message = require('./message');
  const TH      = require('./test-helper');

  const serverSession = require('./main-server');
  var test, v;

  TH.testCase(module, {
    setUp() {
      test = this;
      v = {};
      v.ws = TH.mockWs();
      v.mockSess = {
        _wssOverride: function() {
          return v.ws;
        },
        provide: test.stub(),
        _rpcs: {},
      };
    },

    tearDown() {
      v = null;
    },

    "test versionHash"() {
      v.sess = serverSession(v.mockSess);
      assert.calledWith(v.ws.on, 'connection', TH.match(function (func) {
        return v.func = func;
      }));

      v.sess.addToDict('foo');

      v.sess.registerGlobalDictionaryAdder({id: 'test'}, function (adder) {
        adder('g1'); adder('g2');
      });

      assert.same(v.sess.versionHash, koru.versionHash);

      v.sess.versionHash = 'h1';

      TH.noInfo();
      v.func(v.ws, v.ws._upgradeReq);

      assert.calledWith(v.ws.send, TH.match(arg => {
        v.msg = message.decodeMessage(arg.subarray(1), session.globalDict);
        assert.equals(v.msg, ['', 'h1', TH.match.any, TH.match.string]);

        return arg[0] === 88;
      }), {binary: true});

      var dict = message.newGlobalDict();

      assert.same(v.msg[2].length, 11);


      message.decodeDict(v.msg[2], 0, dict);
      message.finalizeGlobalDict(dict);

      assert.same(dict.k2c['g1'], 0xfffd);
      assert.same(dict.k2c['g2'], 0xfffe);

      assert.same(v.sess.globalDict.k2c['foo'], 0xfffc);
      assert.same(v.sess.globalDict.k2c['g2'], 0xfffe);
      assert.same(v.sess.globalDict.k2c['g1'], 0xfffd);

      v.sess.addToDict('fuz');

      assert.same(v.sess.globalDict.k2c['fuz'], undefined);
    },

    "test client errors"() {
       v.sess = serverSession(v.mockSess);

      assert.calledWith(v.sess.provide, 'E', TH.match(function (func) {
        return v.func = func;
      }));

      test.stub(koru, 'logger');
      v.sess.sessId = 's123';
      v.func.call({send: v.send = test.stub(), sessId: 's123', engine: 'test engine'}, 'hello world');
      assert.calledWith(koru.logger, 'INFO', 's123', 'test engine', 'hello world');
    },

    "test onclose"() {
      TH.noInfo();
      var conn = TH.sessionConnect(v.ws);

      assert.calledWith(v.ws.on, 'close', TH.match(function (func) {
        v.func = func;
        return typeof func === 'function';
      }));

      test.spy(conn, 'close');

      v.func();

      assert.called(conn.close);
      refute(conn.sessId in session.conns);
    },
  });
});
