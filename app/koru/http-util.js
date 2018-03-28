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


  const THROW_NONE = {};

  const THROW_5XX = {
    serverError: 'throw',
  };

  const THROW_ERROR = {
    serverError: 'throw',
    clientError: 'throw',
  };

  const THROW_ERROR_NOT_404 = Object.assign({404: 'return'}, THROW_ERROR);


  return {
    HttpError,

    THROW_NONE,
    THROW_ERROR,
    THROW_5XX,
    THROW_ERROR_NOT_404,

    request: (options, action)=>{
      if (options.timeout === undefined)
        options.timeout = 20*1000;

      if (typeof action === 'function') {
        return request(options, action);
      }

      const future = new util.Future;
      let reqHandle;
      reqHandle = request(options, (error, response, body)=>{
        reqHandle = undefined;
        future.return(error != null ? {
          message: error.message,
          statusCode: error.code === 'ETIMEDOUT'
            ? 504 : (error.errno === 'ECONNREFUSED' ? 503 : 500)
        } : {statusCode: response.statusCode, response, body});
      });

      let result;
      try {
        result = future.wait();
      } catch(ex) {
        if (reqHandle !== undefined)
          reqHandle.abort();

        if (ex instanceof Error) throw ex;
        if (ex.constructor === Object)
          return ex;
        return {interrupt: ex};
      }
      const {statusCode} = result;
      if (statusCode > 299) {
        const actionOpts = action === undefined ? THROW_5XX : action;
        let actionCmd = undefined;
        if (statusCode > 399) {
          if (statusCode > 499) {
            actionCmd = actionOpts.serverError;
          } else {
            actionCmd = actionOpts[''+statusCode] || actionOpts.clientError;
          }
        }

        if (actionCmd === 'throw')
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
