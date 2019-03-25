define((require)=>{
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const util            = require('koru/util');
  const queue           = require('./queue')();

  const Path = requirejs.nodeRequire('path');

  const types = {};

  const Compilers = {
    set(type, compiler) {types[type] = compiler},
    has(type) {return types[type] !== undefined},

    compile(type, path, outPath) {
      const compiler = types[type];
      if (compiler === undefined) return;

      return queue(path, ()=>{
        const srcSt = fst.stat(path);
        const jsSt = fst.stat(outPath);

        if (srcSt === undefined)
          throw new koru.Error(404, outPath + ' not found');

        if (jsSt === undefined) fst.mkdir(Path.dirname(outPath));

        if (jsSt === undefined || +jsSt.mtime < +srcSt.mtime) {
          compiler(type, path, outPath);
        }
      });
    },

    read(type, path, outPath) {
      this.compile(type, path, outPath);
      return fst.readFile(outPath).toString();
    }
  };

  return Compilers;
});
