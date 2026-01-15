const path = require('path');
const fsp = require('fs/promises');

define((require) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const SimpleMutex     = require('koru/util/simple-mutex');

  const {SourceMapConsumer} = requirejs.nodeRequire('source-map');

  const STACK_LINE_SEP_RE = /\n  *at /;
  const STACK_LINE_RE = /(.*)\((.*\.js\b).*:(\d+):(\d+)\)$/;

  const loadMap = (source) => new SourceMapConsumer(source);

  const StackErrorConvert = {
    start: ({sourceMapDir, prefix = '.', lineAdjust = 0}) => {
      let consumer = null;
      let lastFileName = '';
      const mutex = new SimpleMutex();

      const destroyConsumer = () => {
        if (consumer !== null) {
          consumer.destroy();
          consumer = null;
        }
      };

      koru.clientErrorConvert = async (data) => {
        await mutex.lock();
        try {
          if (typeof data !== 'string') {
            throw new TypeError('data is not a string');
          }

          const line_sep = STACK_LINE_SEP_RE.exec(data)?.[0];
          if (line_sep === undefined) {
            return data;
          }

          const lines = data.split(line_sep);
          for (let i = 1; i < lines.length; ++i) {
            const m = STACK_LINE_RE.exec(lines[i]);
            if (m !== null && m[2].indexOf('..') === -1) {
              const fn = m[2];
              if (fn !== lastFileName) {
                lastFileName = fn;
                const pn = path.join(sourceMapDir, m[2] + '.map');
                destroyConsumer();
                consumer = (await fst.stat(pn)) === undefined
                  ? null
                  : await loadMap((await fsp.readFile(pn)).toString());
              }
              if (consumer !== null) {
                const orig = consumer.originalPositionFor({
                  line: +m[3] + lineAdjust,
                  column: +m[4],
                });
                if (orig.source !== null) {
                  lines[i] = `${m[1]}${orig.name} ` +
                    `(${path.join(prefix, orig.source)}:${orig.line}:${orig.column})`;
                }
              }
            }
          }

          return lines.join(line_sep);
        } finally {
          destroyConsumer();
          mutex.unlock();
        }
      };
    },
    stop: () => {
      koru.clientErrorConvert = undefined;
    },
  };

  return StackErrorConvert;
});
