let http = require('http');
let https = require('https');
const HttpError = require('./http-error');

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

  request: async ({
    url, method='GET', headers={}, timeout=20000, maxContentSize=100*1024*1024,
    json=false, body}, action=THROW_5XX) => {
      if (body !== undefined) {
        body = Buffer.from(JSON.stringify(body));
      }
      if (headers['Content-Type'] === undefined) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = body === undefined ? 0 : body.length;

      let req, result;

      const promise = new Promise((resolve, reject) => {
        let resBody = '';
        req = (url.startsWith('https') ? https : http).request(url, {method, headers, timeout}, (res) => {
          res.on('data', (chunk) => {
            if (result !== undefined) return;
            const str = chunk.toString();
            if (resBody.length + str.length > maxContentSize) {
              req.destroy();
              resolve({statusCode: 400, message: 'Response too large'});
              return;
            }
            resBody += chunk.toString();
          });
          res.on('error', (ex) => {reject(ex)});
          res.on('end', () => {
            if (result !== undefined) return;
            let body = resBody;
            try {
              if (res.headers['content-type']?.toLowerCase().indexOf('/json') != -1) {
                body = JSON.parse(resBody);
              }
            } catch (err) {}
            resolve({statusCode: res.statusCode, response: res, body});
          });
        });

        req.on('error', (error) => {
          if (error.statusCode !== undefined) {
            resolve(error);
          } else if (error.code === 'ECONNREFUSED') {
            resolve({
              message: 'Connection Refused',
              statusCode: 503,
            });
          } else {
            resolve({
              message: error.message,
              statusCode: error.code === 'ETIMEDOUT' ? 504 : 500,
            });
          }
        });

        req.setTimeout(timeout, () => {
          req.destroy({code: 'ETIMEDOUT', message: 'Timeout'});
        });

        req.end(body);
      });

      try {
        result = await promise;
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

module.exports = HttpSender;
