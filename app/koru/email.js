var Future = requirejs.nodeRequire('fibers/future');
var urlModule = require('url');
var MailComposer = requirejs.nodeRequire('mailcomposer').MailComposer;
var smtp = requirejs.nodeRequire('simplesmtp');

define(function(require, exports, module) {
  var util = require('koru/util');

  util.extend(exports, {
    send: function (options) {
      var mc = new MailComposer();

      mc.setMessageOption(options);

      var future = new Future();
      exports._pool.sendMail(mc, future.resolver());

      future.wait();
    },

    initPool: function (url) {
      if (typeof url === 'string') {
        var mailUrl = urlModule.parse(url);
        if (mailUrl.protocol !== 'smtp:')
          throw new Error("Email protocol must be 'smtp'");

        var port = +(mailUrl.port);
        var auth = false;
        if (mailUrl.auth) {
          var parts = mailUrl.auth.split(':', 2);
          auth = {user: parts[0] && decodeURIComponent(parts[0]),
                  pass: parts[1] && decodeURIComponent(parts[1])};
        }

        exports._pool = smtp.createClientPool(
          port,                   // Defaults to 25
          mailUrl.hostname,       // Defaults to "localhost"
          { secureConnection: (port === 465),
            auth: auth });

      } else {
        var stream = url || process.stdout;
        exports._pool = {
          sendMail: function (mc, callback) {
            mc.streamMessage();
            mc.on('end', callback);
            mc.pipe(stream, {end: false});
          },
        };
      }
    },

    /** private */

    _pool: {
      // throw exceptiion by default
      sendMail: function (mc, callback) {
        throw new Error('Email has not been initialized');
      }
    },

    get _smtp() {
      return smtp;
    },
  });
});
