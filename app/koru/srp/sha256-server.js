const crypto = requirejs.nodeRequire('crypto');

define(()=>{
  const SHA256 = s =>{
    const hash = crypto.createHash('sha256');
    hash.update(s);
    return hash.digest('hex');
  };

  return SHA256;
});
