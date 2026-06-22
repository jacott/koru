define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');
  const crypto          = requirejs.nodeRequire('crypto');

  const {idLen, u32Id, u8Id, id} = util;

  return (AccSha256) => {
    AccSha256.toId = (text, hash) => {
      if (hash === undefined) {
        const hashBuffer = crypto.createHash('sha256').update(text).digest();

        // Read 4-byte chunks as Big-Endian integers to match your platform's expected layout
        for (let i = 0; i < 5; i++) {
          u32Id[i] = hashBuffer.readUInt32BE(i * 4);
        }
      } else {
        u32Id.set(AccSha256.add(text, hash));
      }

      return id();
    };
  };
});
