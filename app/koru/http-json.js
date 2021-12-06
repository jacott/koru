define((require, exports, module) => {
  'use strict';
  const HttpUtil        = require('koru/http-util');
  const util            = require('koru/util');

  let http = requirejs.nodeRequire('http');
  let https = requirejs.nodeRequire('https');

  const {HttpError} = HttpUtil;

  const THROW_NONE = {};

  const THROW_5XX = {
    serverError: 'throw',
  };

  const THROW_ERROR = {
    serverError: 'throw',
    clientError: 'throw',
  };

  const THROW_ERROR_NOT_404 = Object.assign({404: 'return'}, THROW_ERROR);

  const HttpSender = {
    THROW_NONE,
    THROW_ERROR,
    THROW_5XX,
    THROW_ERROR_NOT_404,

    request: ({
      url, method='GET', headers={}, timeout=20000, maxContentSize=100*1024*1024,
      json=false, body}, action=THROW_5XX) => {
        if (body !== void 0) {
          body = JSON.stringify(body);
        }
        if (headers['Content-Type'] === void 0) {
          headers['Content-Type'] = 'application/json';
        }
        headers['Content-Length'] = body === void 0 ? 0 : body.length;

        const future = new util.Future();
        let resBody = '';
        let req = (url.startsWith('https') ? https : http).request(url, {method, headers, timeout}, (res) => {
          res.on('data', (chunk) => {
            if (future.resolved) return;
            const str = chunk.toString();
            if (resBody.length + str.length > maxContentSize) {
              req.destroy();
              future.return({statusCode: 400, message: 'Response too large'});
              return;
            }
            resBody += chunk.toString();
          });
          res.on('error', (ex) => {future.throw(ex)});
          res.on('end', () => {
            if (future.resolved) return;
            let body = resBody;
            try {
              if (res.headers['content-type']?.toLowerCase().indexOf('/json') != -1) {
                body = JSON.parse(resBody);
              }
            } catch (err) {}
            future.return({statusCode: res.statusCode, response: res, body});
          });
        });

        req.on('error', (error) => {
          if (error.statusCode !== void 0) {
            future.return(error);
          } else if (error.code === 'ECONNREFUSED') {
            future.return({
              message: 'Connection Refused',
              statusCode: 503,
            });
          } else {
            future.return({
              message: error.message,
              statusCode: error.code === 'ETIMEDOUT' ? 504 : 500,
            });
          }
        });

        req.setTimeout(timeout, () => {
          req.destroy({code: 'ETIMEDOUT', message: 'Timeout'});
        });

        req.end(body);

        let result;
        try {
          result = future.wait();
        } catch (ex) {
          if (ex instanceof Error) throw ex;
          if (ex.constructor === Object) {
            return ex;
          }
          return {interrupt: ex};
        } finally {
          req?.destroy();
        }
        const {statusCode} = result;
        if (statusCode > 299) {
          let actionCmd = undefined;
          if (statusCode > 399) {
            if (statusCode > 499) {
              actionCmd = action.serverError;
            } else {
              actionCmd = action['' + statusCode] ?? action.clientError;
            }
          }

          if (actionCmd === 'throw') {
            throw new HttpError(result);
          }
        }
        return result;
      },
  };

  if (isTest) HttpSender[isTest] = {
    get http() {return http},
    set http(v) {http = v},
    get https() {return https},
    set https(v) {https = v},
  };

  return HttpSender;
});
