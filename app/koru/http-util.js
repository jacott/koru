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

    renderContent(response, {data, contentType, encoding='utf-8', prefix, eTag}) {
      if (data === undefined) {
        response.writeHead(204, {'Content-Length': 0});
        response.end('');
        return;
      }
      if (contentType === undefined) {
        if (typeof data === 'string') {
          contentType = 'text';
        } else {
          contentType = 'application/json';
          data = JSON.stringify(data);
        }
      }
      const header = {
        'Content-Length': (prefix === undefined ? 0 : prefix.length)+Buffer.byteLength(data, encoding),
        'Content-Type': `${contentType}; charset=${encoding}`,
      };
      if (eTag !== undefined) header.ETag = `W/"${eTag}"`;
      response.writeHead(200, header);
      if (prefix !== undefined) response.write(prefix);
      response.end(data);
    },
  };
});
