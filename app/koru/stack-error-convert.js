const path = require('path');

define((require)=>{
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const util            = require('koru/util');

  const {SourceMapConsumer} = requirejs.nodeRequire('source-map');

  const STACK_LINE_SEP = "\n    at ";

  const loadMap = (source)=> util.Future.fromPromise(new SourceMapConsumer(source)).wait();

  const StackErrorConvert = {
    start: ({sourceMapDir, prefix=".", lineAdjust=0})=>{
      let consumer = null;
      let lastFileName = '';
      koru.clientErrorConvert = data =>{
        if (data.indexOf(STACK_LINE_SEP) === -1 || ! /^    at .*\(.*\.js\b.*:\d+:\d+\)$/m.test(data))
          return data;

        const re = /(.*)\((.*\.js\b).*:(\d+):(\d+)\)$/;
        const lines = data.split(STACK_LINE_SEP);
        let prevFile = '';
        for(let i = 1; i < lines.length; ++i) {
          const m = re.exec(lines[i]);
          if (m !== null && m[2].indexOf("..") === -1) {
            const fn = lines[i];
            if (fn !== lastFileName) {
              lastFileName = fn;
              const pn = path.join(sourceMapDir, m[2]+'.map');
              consumer = fst.stat(pn) === undefined ? null : loadMap(fst.readFile(pn).toString());
            }
            if (consumer !== null ) {
              const orig = consumer.originalPositionFor({line: +m[3] + lineAdjust, column: +m[4]});
              if (orig.source !== null)
                lines[i] = `${m[1]}${orig.name} `+
                `(${path.join(prefix, orig.source)}:${orig.line}:${orig.column})`;
            }
          }
        }

        return lines.join(STACK_LINE_SEP);
      };
    },
    stop: ()=>{
      koru.clientErrorConvert = undefined;
    },
  };

  return StackErrorConvert;
});
