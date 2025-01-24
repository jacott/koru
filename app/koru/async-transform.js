define((require, exports, module) => {
  'use strict';
  const {isCandidateFilename, convert} = requirejs.nodeRequire('koru/amd-loader/async-convert');
  const {Transform}     = requirejs.nodeRequire('node:stream');

  class ClientAsyncTransform extends Transform {
    #data = [];
    _transform(data, encoding, callback) {
      this.#data.push(data);
      callback();
    }

    _flush(callback) {
      const data = this.#data.length === 1 ? this.#data[0] : Buffer.concat(this.#data);
      try {
        convert(data);
        callback(null, data);
      } catch (err) {
        callback(err);
      }
    }
  }

  const transformer = (send, req, path, opts, res) => {
    res.once('pipe', (src) => {
      src.unpipe(res);
      src.pipe(new ClientAsyncTransform()).pipe(res);
    });
    return send(req, path, opts).pipe(res);
  };

  return (req, pathname) => {
    if (req.method === 'GET' &&
      isCandidateFilename(pathname)) {
        return transformer;
      }
  };
});
