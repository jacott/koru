define((require)=>{
  'use strict';
  const util            = require('koru/util');
  const NodeMailer      = requirejs.nodeRequire('nodemailer');
  const SmtpStub        = requirejs.nodeRequire('nodemailer-stub-transport');
  const urlModule       = requirejs.nodeRequire('url');

  let SmtpPool = requirejs.nodeRequire('nodemailer-smtp-pool');

  const Email = {
    send(options) {
      const future = new util.Future();
      Email._transport.sendMail(options, future.resolver());

      future.wait();
    },

    initPool(urlOrTransport) {
      if (typeof urlOrTransport === 'string') {
        const mailUrl = urlModule.parse(urlOrTransport);
        if (mailUrl.protocol !== 'smtp:')
          throw new Error("Email protocol must be 'smtp'");

        const port = +(mailUrl.port);
        let auth = false;
        if (mailUrl.auth) {
          const parts = mailUrl.auth.split(':', 2);
          auth = {user: parts[0] && decodeURIComponent(parts[0]),
                  pass: parts[1] && decodeURIComponent(parts[1])};
        }

        Email._transport = NodeMailer.createTransport(SmtpPool({
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
        Email._transport = NodeMailer.createTransport(urlOrTransport);
      }
    },

    /** private */

    _transport: {
      // throw exception by default
      send(options, callback) {
        throw new Error('Email has not been initialized');
      }
    },

    set SmtpPool(value) {SmtpPool = value},
    get SmtpPool() {return SmtpPool},
  };

  return Email;
});
