define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const {idLen, u32Id, u8Id, id} = util;

  return (AccSha256) => {
    AccSha256.toId = (text, hash) => (u32Id.set(AccSha256.add(text, hash)), id());
  };
});
