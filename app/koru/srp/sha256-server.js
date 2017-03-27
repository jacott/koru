const crypto = requirejs.nodeRequire('crypto');

define(function() {
  function SHA256(s) {
    const hash = crypto.createHash('sha256');
    hash.update(s);
    return hash.digest('hex');
  }

  return SHA256;
});
