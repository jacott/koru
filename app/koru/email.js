define((require) => {
  'use strict';
  const Email = {
    send: (options) =>
      new Promise((resolve) => {
        Email._transport.sendMail(options, resolve);
      }),

    initPool(transport) {
      if (typeof transport.sendMail !== 'function') {
        throw new Error('Invalid email transport');
      }

      Email._transport = transport;
    },

    stubPool() {
      Email.initPool({
        sendMail(options, callback) {
          console.log(`Email Stub:
To: ${options.to}
From: ${options.from}
Subject: ${options.subject}
======== Text ===========
${options.text}
======== HTML ===========
${options.html}
======== EOM ============`);
          callback();
        },
      });
    },

    /** private */

    _transport: {
      // throw exception by default
      send(options, callback) {
        throw new Error('Email has not been initialized');
      },
    },
  };

  return Email;
});
