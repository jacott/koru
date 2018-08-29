define(()=>{
  const crypto = requirejs.nodeRequire('crypto');
  const SHA256 = s =>{
    const hash = crypto.createHash('sha256');
    hash.update(s);
    return hash.digest('hex');
  };

  return SHA256;
});
