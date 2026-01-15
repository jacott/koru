const path = require('path');
const fsp = require('fs/promises');

define((require) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const SimpleMutex     = require('koru/util/simple-mutex');

  const {SourceMapConsumer} = requirejs.nodeRequire('source-map');

  const loadMap = (source) => new SourceMapConsumer(source);

  let consumer = null;
  let lastFileName = '';
  const destroyConsumer = () => {
    if (consumer !== null) {
      consumer.destroy();
      consumer = null;
      lastFileName = '';
    }
  };

  const StackErrorConvert = {
    start: ({sourceMapDir, prefix = '.', lineAdjust = 0}) => {
      destroyConsumer();
      const mutex = new SimpleMutex();

      koru.clientErrorConvert = async (data) => {
        await mutex.lock();
        try {
          if (typeof data !== 'string') {
            throw new TypeError('data is not a string');
          }

          const STACK_LINE_SEP_RE = /\n  *at /;
          const STACK_LINE_RE = /(.*)(index*\.js\b)[^:]*:(\d+):(\d+)\)?$/;

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
                  let preamble = m[1];
                  if (preamble.endsWith('(')) {
                    preamble = preamble.slice(0, -1);
                  }

                  lines[i] = `${preamble}${orig.name} ` +
                    `(${path.join(prefix, orig.source)}:${orig.line}:${orig.column})`;
                }
              }
            }
          }

          return lines.join(line_sep);
        } finally {
          mutex.unlock();
        }
      };
    },
    stop: () => {
      destroyConsumer();
      koru.clientErrorConvert = undefined;
    },
  };

  return StackErrorConvert;
});
