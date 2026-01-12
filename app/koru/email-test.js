isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
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
      Email.initPool({
        sendMail(options, callback) {
          v.sendOpts = options;
          callback();
        },
      });
      await Email.send(v.options = {from: 'foo@vimaly.com'});

      assert.same(v.sendOpts, v.options);
    });

    test('stubPool', async () => {
      stub(console, 'log');

      Email.stubPool();
      await Email.send({
        from: 'foo@vimaly.com',
        to: 'bar@vimaly.com',
        subject: 'The subject',
        text: 'The text body',
      });

      assert.calledOnce(console.log);
      assert.equals(
        console.log.firstCall.args[0],
        'Email Stub:\nTo: bar@vimaly.com\nFrom: foo@vimaly.com\nSubject: The subject\n======== Text ===========\nThe text body\n======== HTML ===========\nundefined\n======== EOM ============',
      );
    });
  });
});
