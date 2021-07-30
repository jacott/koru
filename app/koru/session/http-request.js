define((require, exports, module)=>{
  'use strict';

  return {
    remoteAddress: (request) => {
      const remoteAddress = request.connection.remoteAddress;
      return /127\.0\.0\.1$|^::1$/.test(remoteAddress)
        ? request.headers['x-real-ip'] || remoteAddress
        : remoteAddress;
    }
  }
});
