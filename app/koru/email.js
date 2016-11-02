var Future = requirejs.nodeRequire('fibers/future');
var urlModule = require('url');
var NodeMailer = requirejs.nodeRequire('nodemailer');
var SmtpPool = requirejs.nodeRequire('nodemailer-smtp-pool');
var SmtpStub = requirejs.nodeRequire('nodemailer-stub-transport');
var nodeUtil = require("util");
var events = require("events");
var stream = require('stream');

function DebugStream() {
  stream.Writable.call(this, {defaultEncoding: 'utf8'});
}

nodeUtil.inherits(DebugStream, stream.Writable);

DebugStream.prototype._write = function(data, encoding, callback) {
  callback();
};


define(function(require, exports, module) {
  var util = require('koru/util');

  util.extend(exports, {
    send: function (options) {
      var future = new Future();
      exports._transport.sendMail(options, future.resolver());

      future.wait();
    },

    initPool: function (urlOrTransport) {
      if (typeof urlOrTransport === 'string') {
        var mailUrl = urlModule.parse(urlOrTransport);
        if (mailUrl.protocol !== 'smtp:')
          throw new Error("Email protocol must be 'smtp'");

        var port = +(mailUrl.port);
        var auth = false;
        if (mailUrl.auth) {
          var parts = mailUrl.auth.split(':', 2);
          auth = {user: parts[0] && decodeURIComponent(parts[0]),
                  pass: parts[1] && decodeURIComponent(parts[1])};
        }

        exports._transport = NodeMailer.createTransport(SmtpPool({
          port: port || 25,
          host: mailUrl.hostname || 'localhost',
          secure: false,
          requireTLS: port == 465,
          auth: auth
        }));

      } else {
        if (! urlOrTransport) {
          urlOrTransport = SmtpStub();

          urlOrTransport.on('log', function (info) {
            switch(info.type) {
            case 'message':
              console.log(info.message.replace(/=([A-F0-9]{2})/g, function (_, hex) {
                return String.fromCharCode(parseInt(hex, 16));
              }).replace(/=\r\n/g, '').replace(/\r\n/g, '\n'));
              break;
            default:
              console.log("====== Email ======");
            }
          });
        }
        exports._transport = NodeMailer.createTransport(urlOrTransport);
      }
    },

    /** private */

    _transport: {
      // throw exceptiion by default
      send: function (options, callback) {
        throw new Error('Email has not been initialized');
      }
    },

    set SmtpPool(value) {SmtpPool = value},
    get SmtpPool() {return SmtpPool},
  });
});
