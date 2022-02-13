define((require) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const util            = require('koru/util');
  const queue           = require('./queue')();
  const fsp             = requirejs.nodeRequire('fs/promises');

  const Path = requirejs.nodeRequire('path');

  const types = {};

  const Compilers = {
    set(type, compiler) {types[type] = compiler},
    has(type) {return types[type] !== undefined},

    async compile(type, path, outPath) {
      const compiler = types[type];
      if (compiler === undefined) return;

      return await queue(path, async () => {
        const srcSt = await fst.stat(path);
        const outSt = await fst.stat(outPath);

        if (srcSt === undefined) {
          throw new koru.Error(404, path + ' not found');
        }

        if (outSt === undefined) await fst.mkdir_p(Path.dirname(outPath));

        if (outSt === undefined || + outSt.mtime < + srcSt.mtime) {
          await compiler(type, path, outPath);
        }
      });
    },

    async read(type, path, outPath) {
      await this.compile(type, path, outPath);
      return (await fsp.readFile(outPath)).toString();
    },
  };

  return Compilers;
});
