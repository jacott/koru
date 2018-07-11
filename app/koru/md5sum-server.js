define(()=>{
  const crypto = requirejs.nodeRequire('crypto');

  const md5sum = string =>{
    const md5 = crypto.createHash('md5');
    md5.update(string);
    return md5.digest('hex');
  };

  return md5sum;
});
