isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');
  const Intercept       = require('koru/test/intercept');
  const format          = require('./format');

  const doc = require('./doc');

  const { stub, spy, after } = TH;

  TH.testCase(module, ({ test, afterEach }) => {
    afterEach(() => {
      Intercept.interceptObj = Intercept.locals = void 0;
    });

    test('server', () => {
      Intercept.interceptObj = { data: 123 };
      const ws = { send: stub() };
      doc(ws, null, 'data');

      assert.calledWith(ws.send, 'ID{"object":"Object.prototype","name":"data",' +
                        '"propertyType":"value","value":"123","valueType":"number"}');
    });

    test('client', () => {
      const ws = { send: stub() };
      const conn = { ws: { send: stub() }};

      doc(ws, { client1: { conns: new Set([conn]) }}, 'data');

      refute.called(ws.send);
      assert.calledWith(conn.ws.send, 'Ddata');
    });
  });
});
