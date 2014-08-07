isServer && define(function (require, exports, module) {
  var test, v;
  var TH = require('./test');
  var Email = require('./email');

  var nodeUtil = requirejs.nodeRequire('util');
  var stream = require('stream');
  var smtp = requirejs.nodeRequire('simplesmtp');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.origPool = Email._pool;
    },

    tearDown: function () {
      Email._pool = v.origPool;
      v = null;
    },

    "test send": function () {
      Email._pool = {
        sendMail: function (mc, callback) {
          v.mc = mc;
          callback();
        },
      };
      Email.send(v.options = {
        from: "foo@obeya.co",
        to: "bar@obeya.co",
        cc: ["baz@obeya.co", "fnord@obeya.co"],
        subject: "The subject",
        text: "The text body",
      });

      assert(v.mc);

      var msg = v.mc._message;
      assert.same(msg.from, v.options.from);
      assert.same(msg.to, v.options.to);
      assert.same(msg.cc, v.options.cc.join(", "));
      assert.same(msg.subject, v.options.subject);
      assert.same(msg.body, v.options.text);
    },

    "test initPool to stream": function () {
      function DebugStream() {
        stream.Writable.call(this, {defaultEncoding: 'utf8'});
      }

      nodeUtil.inherits(DebugStream, stream.Writable);

      var result = [];

      DebugStream.prototype._write = function(data, encoding, callback) {
        result.push(data.toString());
        callback();
      };
      Email.initPool(new DebugStream());
      Email.send(v.options = {
        from: "foo@obeya.co",
        to: "bar@obeya.co",
        subject: "The subject",
        text: "The text body",
      });

      assert.match(result.join(''), /Subject: The subject/);
    },

    "test initPool to url": function () {
      assert.same(Email._smtp, smtp);

      var createClientPool = test.stub(Email._smtp, 'createClientPool').returns('xCCP');
      Email.initPool("smtp://foo:bar@obeya.co:465");

      assert.calledOnce(createClientPool);
      assert.calledWith(createClientPool, 465, "obeya.co", {auth: {user: 'foo', pass: 'bar'}, secureConnection: true});

      assert.same(Email._pool, 'xCCP');
    },
  });
});
