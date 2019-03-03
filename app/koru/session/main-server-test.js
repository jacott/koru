isServer && define((require, exports, module)=>{
  const koru            = require('koru');
  const message         = require('koru/session/message');
  const api             = require('koru/test/api');
  const util            = require('koru/util');
  const serverSession   = require('./main-server');
  const TH              = require('./test-helper');

  const {test$} = require('koru/symbols');

  const {stub, spy, onEnd, match: m, stubProperty} = TH;

  const Session = require('./main');
  let v = {};

  TH.testCase(module, ({before, beforeEach, afterEach, group, test})=>{
    before(()=>{
      api.module({subjectModule: module.get('./main'), subjectName: 'Session'});
    });

    beforeEach(()=>{
      v.ws = TH.mockWs();
      v.mockSess = {
        _wssOverride: function() {
          return v.ws;
        },
        provide: stub(),
        _rpcs: {},
      };
    });

    afterEach(()=>{
      v = {};
    });

    test("openBatch", ()=>{
      /**
       * Build an encoded batch message.

       * @returns `{push, encode}`. Use `push` to append a message to the batch. Use `encode` to
       * return the encoded batch.
       **/
      api.method();
      //[
      const {push, encode} = Session.openBatch();
      push(['A', ['Book', {_id: 'book1', title: 'Dune'}]]);
      push(['R', ['Book', 'book2']]);
      const msg = encode();

      assert.equals(String.fromCharCode(msg[0]), 'W');
      assert.equals(message.decodeMessage(msg.subarray(1), Session.globalDict), [
        ['A', ['Book', {_id: 'book1', title: 'Dune'}]], ['R', ['Book', 'book2']]]);
      //]
    });

    test("versionHash", ()=>{
      v.sess = serverSession(v.mockSess);
      assert.calledWith(v.ws.on, 'connection', m(func => v.func = func));

      v.sess.addToDict('foo');

      v.sess.registerGlobalDictionaryAdder({id: 'test'}, adder =>{
        adder('g1'); adder('g2');
      });

      assert.same(v.sess.versionHash, koru.versionHash);

      v.sess.versionHash = 'h1';

      TH.noInfo();
      v.func(v.ws, v.ws[test$].request);

      assert.calledWith(v.ws.send, TH.match(arg => {
        v.msg = message.decodeMessage(arg.subarray(1), Session.globalDict);
        assert.equals(v.msg, ['', 'h1', TH.match.any, TH.match.string]);

        return arg[0] === 88;
      }), {binary: true});

      const dict = message.newGlobalDict();

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
    });

    test("client errors", ()=>{
       v.sess = serverSession(v.mockSess);

      let func;
      assert.calledWith(v.sess.provide, 'E', TH.match(f => func = f));

      stub(koru, 'logger');
      v.sess.sessId = 's123';
      func.call({send: v.send = stub(), sessId: 'sess123', engine: 'myEngine'}, 'hello world');
      assert.calledWith(koru.logger, 'ERROR', 'sess123', 'myEngine', 'hello world');
    });

    test("clientErrorConvert", ()=>{
      v.sess = serverSession(v.mockSess);

      let func;
      assert.calledWith(v.sess.provide, 'E', TH.match(f => func = f));

      const clientErrorConvert = stub().returns("converted");

      stub(koru, 'logger');
      v.sess.sessId = 's123';
      stubProperty(koru, 'clientErrorConvert', {value: clientErrorConvert});
      func.call({send: v.send = stub(), sessId: 'sess123', engine: 'myEngine'}, 'my message');

      assert.calledWith(
        koru.logger, 'ERROR', 'sess123', 'myEngine', 'converted');
    });

    test("onerror", ()=>{
      stub(koru, 'info');
      const conn = TH.sessionConnect(v.ws);

      assert.calledWith(v.ws.on, 'error', TH.match(func => v.func = func));

      spy(conn, 'close');

      stub(koru, 'fiberConnWrapper');

      v.func('my error');

      refute.called(conn.close);
      assert.calledWith(koru.fiberConnWrapper, TH.match.func, conn);

      koru.info.reset();
      koru.fiberConnWrapper.yield();

      assert.calledWith(koru.info, 'web socket error', 'my error');
      assert.called(conn.close);
      refute(conn.sessId in Session.conns);
    });

    test("onclose", ()=>{
      TH.noInfo();
      const conn = TH.sessionConnect(v.ws);

      assert.calledWith(v.ws.on, 'close', TH.match(func => v.func = func));

      spy(conn, 'close');

      stub(koru, 'fiberConnWrapper');

      v.func();

      refute.called(conn.close);

      assert.calledWith(koru.fiberConnWrapper, TH.match.func, conn);
      koru.fiberConnWrapper.yield();

      assert.called(conn.close);
      refute(conn.sessId in Session.conns);
    });
  });
});
