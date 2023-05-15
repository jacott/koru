define((require) => {
  'use strict';
  const koru            = require('koru');
  const Future          = require('koru/future');
  const HttpError       = requirejs.nodeRequire('koru/lib/http-error');
  const util            = require('koru/util');
  const stream          = requirejs.nodeRequire('node:stream');
  const zlib            = requirejs.nodeRequire('node:zlib');

  const DAY24 = 24 * util.DAY;

  const HttpUtil = {
    HttpError,

    expBackoff(func, config={}) {
      config.retryCount = 0;
      if (config.minDelay == null) config.minDelay = 30*1000;
      if (config.maxDelay == null) {
        config.maxDelay = 90*60*1000;
      } else if (config.maxDelay > DAY24) {
        throw new Error('config.maxDelay to big');
      }
      if (config.variance == null) config.variance = 10*1000;
      const wrapper = () => {
        config.timer = 0;
        Promise.resolve().then(async () => {
          const ans = config?.onSuccess(await func());
          if (isPromise(ans)) await ans;
        }).catch((err) => {
          if (config.isRetry === undefined ? err.statusCode >= 500 : config.isRetry(err)) {
            config.timer = koru.setTimeout(
              wrapper,
              Math.min(
                config.maxDelay,
                (2 ** config.retryCount++) * config.minDelay + Math.floor(Math.random() * config.variance)),
            );
          } else if (config.onFailure === undefined) {
            koru.unhandledException(err);
          } else {
            config.onFailure(err);
          }
        }).catch(koru.unhandledException);
      };
      config.timer = koru.setTimeout(wrapper, 0);
    },

    pipeBody: (req, {limit=1000*1000}) => {
      const input = /gzip|deflate/i.test(req.headers['content-encoding'] ?? '')
        ? req.pipe(zlib.createUnzip())
        : req;

      let size = 0;

      return input.pipe(new stream.Transform({
        transform(chunk, encoding, callback) {
          if (size += chunk.length > limit) {
            callback(new koru.Error(413, 'request body too large'));
          } else {
            callback(null, chunk);
          }
        },
      }));
    },

    readBody: async (req, {
      encoding='utf8',
      limit,
      asJson=/\bjson\b/.test(req.headers['content-type']),
    }={}) => {
      const future = new Future();
      {
        let string = '';
        const output = HttpUtil.pipeBody(req, {limit});

        output.on('data', (data) => {
          string += data.toString(encoding);
        });
        output.on('error', (err) => {
          if (err instanceof koru.Error) {
            future.reject([err.error, err.reason]);
          } else {
            future.reject([400, err + ' ' + util.inspect({code: err.code, errno: err.errno})]);
          }
        });
        output.on('end', (data) => {
          future.resolve(string);
        });
      }
      let data;
      let body;
      try {
        body = (await future.promise);
      } catch (ex) {
        throw new koru.Error(...ex);
      }
      if (asJson) {
        if (body === '') return {};
        try {
          data = JSON.parse(body);
        } catch (ex) {
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
      if (typeof prefix === 'string') {
        prefix = Buffer.from(prefix);
      }
      if (typeof data === 'string') {
        data = Buffer.from(data);
      }

      const header = {
        'Content-Length': (prefix === undefined ? 0 : prefix.length) + data.length,
        'Content-Type': `${contentType}; charset=${encoding}`,
      };
      if (eTag !== undefined) header.ETag = `W/"${eTag}"`;
      response.writeHead(200, header);
      if (prefix !== undefined) response.write(prefix);
      response.end(data);
    },
  };

  return HttpUtil;
});
