const Future = requirejs.nodeRequire('fibers/future');
const rawBody = requirejs.nodeRequire('raw-body');

define(function(require, exports, module) {
  const koru            = require('koru');
  const util            = require('koru/util');

  return {
    readBody(req, {
      encoding="utf8",
      length=req.headers['content-length'],
      limit="1mb",
      asJson=/\bjson\b/.test(req.headers['content-type']),
    }={}) {
      const future = new Future;
      rawBody(req, {length, length, encoding}, (err, string) => {
        if (err) {
          future.throw(new Error(err.toString()));
        } else
          future.return(string);
      });

      let data;
      const body = future.wait() || "{}";
      if (asJson) {
        try {
          data = JSON.parse(body);
        } catch(ex) {
          throw new koru.Error(400, 'request body must be valid JSON');
        }

        return data;
      } else {
        return body;
      }
    },
  };
});
