define((require)=>{
  'use strict';
  const koru            = require('koru');
  const util            = require('koru/util');
  const stream          = requirejs.nodeRequire('stream');
  const zlib            = requirejs.nodeRequire('zlib');

  const {test$} = require('koru/symbols');

  let request = requirejs.nodeRequire('request');

  const DAY24 = 24*util.DAY;

  class HttpError extends Error {
    constructor({message='Bad Request', statusCode, response, body}={}) {
      if (statusCode === undefined)
        statusCode = response === undefined ? 400 : response.statusCode;
      super(`${message} [${statusCode}]`);
      this.statusCode = statusCode;
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


  const HttpUtil = {
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

    expBackoff(func, config={}) {
      config.retryCount = 0;
      if (config.minDelay == null) config.minDelay = 30*1000;
      if (config.maxDelay == null)
        config.maxDelay = 90*60*1000;
      else if (config.maxDelay > DAY24)
        throw new Error('config.maxDelay to big');
      if (config.variance == null) config.variance = 10*1000;
      const wrapper = ()=>{
        config.timer = 0;
        try {
          const ans = func();
        } catch(ex) {
          if (config.isRetry === undefined ? ex.statusCode >= 500 : config.isRetry(ex)) {
            config.timer = koru.setTimeout(
              wrapper,
              Math.min(
                config.maxDelay,
                (2**config.retryCount++)*config.minDelay + Math.floor(Math.random()*config.variance))
            );

          } else if (config.onFailure === undefined) {
            throw ex;
          } else {
            config.onFailure(ex);
          }
        }
      };
      config.timer = koru.setTimeout(wrapper, 0);
    },

    pipeBody: (req, {limit=1000*1000})=>{
      const input = /gzip|deflate/i.test(req.headers['content-encoding']||'')
            ? req.pipe(zlib.createUnzip())
            : req;

      let size = 0;

      return input.pipe(new stream.Transform({
        transform(chunk, encoding, callback) {
          if (size += chunk.length > limit)
            callback(new koru.Error(413, 'request body too large'));
          else
            callback(null, chunk);
        }
      }));
    },

    readBody: (req, {
      encoding="utf8",
      limit,
      asJson=/\bjson\b/.test(req.headers['content-type']),
    }={})=>{
      const future = new util.Future;
      {
        let string = '';
        const output = HttpUtil.pipeBody(req, {limit});

        output.on('data', data =>{
          string += data.toString(encoding);
        });
        output.on('error', err => {
          if (err instanceof koru.Error)
            future.throw([err.error, err.reason]);
          else
            future.throw([400, err+' '+util.inspect({code: err.code, errno: err.errno})]);
        });
        output.on('end', data =>{
          future.return(string);
        });
      }
      let data;
      let body;
      try {
        body = future.wait() || "{}";
      } catch(ex) {
        throw new koru.Error(...ex);
      }
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

  return HttpUtil;
});
