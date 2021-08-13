define((require) => {
  'use strict';

  return {
    remoteAddress: (request) => {
      const remoteAddress = request.connection.remoteAddress;
      return request.headers['x-real-ip'] || remoteAddress;
    },

    isLocalAddress: (remoteAddress) => /127\.0\.0\.1$|^::1$/.test(remoteAddress),
  };
});
