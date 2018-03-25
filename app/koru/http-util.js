define(function(require, exports, module) {
  const koru            = require('koru');
  const util            = require('koru/util');

  const {test$} = require('koru/symbols');

  const rawBody         = requirejs.nodeRequire('raw-body');

  let request = requirejs.nodeRequire('request');

  class HttpError extends Error {
    constructor({message='Bad Request', statusCode, response, body}={}) {
      super(message);
      this.statusCode = statusCode === undefined
        ? response === undefined ? 400 : response.statusCode
      : statusCode;
      this.response = response;
      this.body = body;
    }
  }

  return {
    HttpError,

    request: (options)=>{
      const future = new util.Future;
      if (options.timeout === undefined)
        options.timeout = 20*1000;
      request(options, (error, response, body)=>{
        future.return(error != null ? {
          message: error.message,
          statusCode: error.code === 'ETIMEDOUT'
            ? 504 : (error.errno === 'ECONNREFUSED' ? 503 : 500)
        } : {response, body});
      });

      const result = future.wait();
      if (result.statusCode > 299) {
        throw new HttpError(result);
      }
      return result;
    },

    readBody(req, {
      encoding="utf8",
      length=req.headers['content-length'],
      limit="1mb",
      asJson=/\bjson\b/.test(req.headers['content-type']),
    }={}) {
      const future = new util.Future;
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

    [test$]: {
      get request() {return request},
      set request(v) {request = v},
    },
  };
});
