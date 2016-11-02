isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var Email = require('./email');
  var util = require('koru/util');

  var nodeUtil = requirejs.nodeRequire('util');
  var stream = require('stream');
  var SmtpPool = requirejs.nodeRequire('nodemailer-smtp-pool');
  var SmtpStub = requirejs.nodeRequire('nodemailer-stub-transport');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.origTransport = Email._transport;
    },

    tearDown: function () {
      Email._transport = v.origTransport;
      v = null;
    },

    "test send": function () {
      Email._transport = {
        sendMail: function (options, callback) {
          v.sendOpts = options;
          callback();
        },
      };
      Email.send(v.options = {from: "foo@obeya.co"});

      assert.same(v.sendOpts, v.options);
    },

    "test initPool to stub": function () {
      var stub = SmtpStub();
      var logCount = 0;
      stub.on('log', function (info) {
        ++logCount;
        if (info.type === 'envelope') v.info = info;
      });

      Email.initPool(stub);
      Email.send(v.options = {
        from: "foo@obeya.co",
        to: "bar@obeya.co",
        subject: "The subject",
        text: "The text body",
      });

      assert.same(logCount, 4);
      assert.equals(JSON.parse(v.info.message), {from: "foo@obeya.co", to: ["bar@obeya.co"]});

    },

    "test initPool to url": function () {
      assert.same(Email.SmtpPool, SmtpPool);

      test.onEnd(function () {Email.SmtpPool = SmtpPool});

      Email.SmtpPool = function (...args) {
        v.smtpPollArgs = args.slice();
        return SmtpStub();
      };


      Email.initPool("smtp://foo:bar@obeya.co:465");

      assert.equals(v.smtpPollArgs, [{port: 465, host: "obeya.co", auth: {user: 'foo', pass: 'bar'}, secure: false, requireTLS: true}]);
    },
  });
});
