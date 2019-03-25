define((require, exports, module)=>{
  'use strict';
  const koru = require('./main');

  const traceDep = (name, dir, done)=>{
    const result = [];
    const map = module.ctx.modules;

    const addDep = (name)=>{
      if (done[name]) return;
      done[name] = true;

      const curr = map[name];
      if (curr === undefined)
        throw new Error("can't find "+name);

      const reqs = curr[dir];
      for (const key in reqs) {
        if (key === '') continue;
        result.push('"'+key+'" -> "'+name+'";');
        addDep(key);
      }
    };

    addDep(name);

    result.push('');

    return result.join("\n");
  };

  exports.both = name => exports.requiredBy(name) + exports.requires(name) +
    '\n"' + name + '" [shape=polygon,sides=4,peripheries=2];';

  exports.all = ()=>{
    const result = [];
    const map = module.ctx.modules;
    for(const id in map) {
      const reqs = map[id]._requiredBy;
      for (const rb in reqs) {
        result.push('"'+rb+'" -> "'+id+'";');
      }
    }

    result.push('');
    return result.join("\n");
  };

  exports.whatRequires = name =>{
    return traceDep(name, '_requiredBy', {});
  };

  exports.requiredBy = (name, excludeCommon) =>{
    return traceDep(name, '_requires', excludeCommon ? {
      "koru/main": true,
      "koru/util": true,
      "koru/util-base": true,
      "koru/test/main": true,
    } : {});
  };
});
