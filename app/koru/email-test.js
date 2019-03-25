isServer && define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const stream          = require('stream');
  const SmtpPool        = requirejs.nodeRequire('nodemailer-smtp-pool');
  const SmtpStub        = requirejs.nodeRequire('nodemailer-stub-transport');
  const nodeUtil        = requirejs.nodeRequire('util');

  const {stub, spy, onEnd} = TH;

  const Email = require('./email');
  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.origTransport = Email._transport;
    });

    afterEach(()=>{
      Email._transport = v.origTransport;
      v = {};
    });

    test("send", ()=>{
      Email._transport = {
        sendMail(options, callback) {
          v.sendOpts = options;
          callback();
        },
      };
      Email.send(v.options = {from: "foo@vimaly.com"});

      assert.same(v.sendOpts, v.options);
    });

    test("initPool to stub", ()=>{
      const stub = SmtpStub();
      let logCount = 0;
      stub.on('log', function (info) {
        ++logCount;
        if (info.type === 'envelope') v.info = info;
      });

      Email.initPool(stub);
      Email.send(v.options = {
        from: "foo@vimaly.com",
        to: "bar@vimaly.com",
        subject: "The subject",
        text: "The text body",
      });

      assert.same(logCount, 5);
      assert.equals(JSON.parse(v.info.message), {
        from: "foo@vimaly.com", to: ["bar@vimaly.com"]});

    });

    test("initPool to url", ()=>{
      assert.same(Email.SmtpPool, SmtpPool);

      onEnd(()=>{Email.SmtpPool = SmtpPool});

      Email.SmtpPool = (...args)=>{
        v.smtpPollArgs = args.slice();
        return SmtpStub();
      };


      Email.initPool("smtp://foo:bar@vimaly.com:465");

      assert.equals(v.smtpPollArgs, [{
        port: 465, host: "vimaly.com", auth: {user: 'foo', pass: 'bar'},
        secure: false, requireTLS: true}]);
    });
  });
});
