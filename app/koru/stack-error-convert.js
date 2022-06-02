const path = require('path');
const fsp = require('fs/promises');

define((require) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const Mutex           = require('koru/mutex');

  const {SourceMapConsumer} = requirejs.nodeRequire('source-map');

  const STACK_LINE_SEP = '\n    at ';

  const loadMap = (source) => new SourceMapConsumer(source);

  const StackErrorConvert = {
    start: ({sourceMapDir, prefix='.', lineAdjust=0}) => {
      let consumer = null;
      let lastFileName = '';
      const mutex = new Mutex();

      const destroyConsumer = () => {
        if (consumer !== null) {
          consumer.destroy();
          consumer = null;
        }
      };

      koru.clientErrorConvert = async (data) => {
        await mutex.lock();
        try {
          if (data.indexOf(STACK_LINE_SEP) === -1 || ! /^    at .*\(.*\.js\b.*:\d+:\d+\)$/m.test(data)) {
            return data;
          }

          const re = /(.*)\((.*\.js\b).*:(\d+):(\d+)\)$/;
          const lines = data.split(STACK_LINE_SEP);
          for (let i = 1; i < lines.length; ++i) {
            const m = re.exec(lines[i]);
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
                const orig = consumer.originalPositionFor({line: + m[3] + lineAdjust, column: + m[4]});
                if (orig.source !== null) {
                  lines[i] = `${m[1]}${orig.name} ` +
                    `(${path.join(prefix, orig.source)}:${orig.line}:${orig.column})`;
                }
              }
            }
          }

          return lines.join(STACK_LINE_SEP);
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
