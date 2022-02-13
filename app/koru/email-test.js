isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const NodeMailer      = requirejs.nodeRequire('nodemailer');
  const SmtpStub        = requirejs.nodeRequire('nodemailer-stub-transport');
  const stream          = require('stream');
  const nodeUtil        = requirejs.nodeRequire('util');

  const {stub, spy} = TH;

  const Email = require('./email');
  let v = {};

  TH.testCase(module, ({after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => {
      v.origTransport = Email._transport;
    });

    afterEach(() => {
      Email._transport = v.origTransport;
      v = {};
    });

    test('send', async () => {
      Email._transport = {
        sendMail(options, callback) {
          v.sendOpts = options;
          callback();
        },
      };
      await Email.send(v.options = {from: 'foo@vimaly.com'});

      assert.same(v.sendOpts, v.options);
    });

    test('initPool to stub', async () => {
      const stub = SmtpStub();
      let logCount = 0;
      stub.on('log', function (info) {
        ++logCount;
        if (info.type === 'envelope') v.info = info;
      });

      Email.initPool(stub);
      await Email.send(v.options = {
        from: 'foo@vimaly.com',
        to: 'bar@vimaly.com',
        subject: 'The subject',
        text: 'The text body',
      });

      assert.same(logCount, 5);
      assert.equals(JSON.parse(v.info.message), {
        from: 'foo@vimaly.com', to: ['bar@vimaly.com']});
    });

    test('initPool to url', () => {
      stub(NodeMailer, 'createTransport');

      Email.initPool('smtp://foo:bar@vimaly.com:465');

      assert.calledOnceWith(NodeMailer.createTransport, {
        pool: true,
        port: 465, host: 'vimaly.com',
        auth: {user: 'foo', pass: 'bar'},
        secure: false, requireTLS: true,
      });
    });
  });
});
