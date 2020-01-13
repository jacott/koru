const path = require('path');
const vm = require('vm');
const fs = require('fs');

define((require, exports, module)=>{
  'use strict';
  const util = require('koru/util');

  const adds$ = Symbol();

  const Module = module.constructor;
  const ctx = module.ctx;

  const modules = [];

  const commentRe = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;
  const requireRe = /=\s*require\s*\(\s*(["'])([^\1\s)]+)\1\s*\)/g;

  const buildModules = (modules)=>{
    let ans = '';
    for (const i of modules) {
      ans += `modules.push(${i});\n`;
    }
    return ans;
  };

  const CYCLE = {};

  const iReq = (id, builder)=>{
    const oldDir = builder.dir;
    const fn = builder.map[id] !== void 0 ? id : ctx.normalizeId(id+".js", oldDir);
    if (builder.map[fn] !== void 0) {
      if (builder.map[fn] == -1)
        throw CYCLE;

      return builder.map[fn];
    }

    builder.map[fn] = -1;

    const oldDefine = global.define;
    builder.dir = path.dirname(fn)+'/';
    let ans;
    global.define = callback =>{
      ans = typeof callback === 'function'
        ? '('+callback.toString().replace(commentRe, '').
        replace(requireRe, (m, m1, m2)=>{
          try {
            const ans = iReq(m2, builder);
            return `= modules[${ans}]`;
          } catch(err) {
            builder.cycleStack.push(fn);
            throw err;
          }
        })+')()'
      : util.inspect(callback);
    };

    try {
      vm.runInThisContext(fs.readFileSync(fn), {
        filename: fn, displayErrors: true, timeout: 5000});

      builder.modules[builder.map[fn] = builder.index] = ans;
      return builder.index++;
    } finally {
      global.define = oldDefine;
      builder.dir = oldDir;
    }
  };

  class InlineScript {
    constructor(dir) {
      this.dir = dir;
      this.topId = void 0;
      this.cycleStack = [];
      this[adds$] = {};
      this.reset();
    }

    require(id) {
      if (this.topId !== id) {
        this.reset();
        this.topId = id;
      }
      if (this.index == 0) {
        const adds = this[adds$];
        for (const i in adds)
          this.modules[this.map[i] = this.index++] = adds[i];
      }
      try {
        return iReq(id, this);
      } catch(err) {
        if (err === CYCLE) {
          const SEP = "\n    at ";
          throw new Error("Cycle detected!" + SEP + this.cycleStack.map(i => i+":1:1").join(SEP));
        }
        throw err;
      }
    }

    generate() {
      this.require(this.topId);
      return this.source || `(()=>{
'use strict';
const modules = [];
${buildModules(this.modules)}
return modules[${this.modules.length-1}];
})()`;
    }

    add(id, object) {
      const adds = this[adds$];
      if (this.map[id] !== void 0 || adds[id] !== void 0) {
        throw new Error(id+" already added");
      }
      if (this.index != 0)
        this.reset();
      adds[id] = object;
    }

    reset() {
      this.index = 0;
      this.modules = [];
      this.map = {};
      this.source = '';
    }
  }

  return InlineScript;
});
