define(function () {
  const crypto = requirejs.nodeRequire('crypto');
  return function md5sum(string) {
    const md5 = crypto.createHash('md5');
    md5.update(string);
    return md5.digest('hex');
  };
});
