const paused$ = Symbol();

class Module {
  constructor(ctx, id, state) {
    this.state = state ?? INIT;
    this.ctx = ctx;
    this._requiredBy = {};
    this.id = id;
    this.depCount = 0;
    if (ctx === undefined) return;

    if (id || this.state !== INIT) ++ctx.resolvingCount;
    if (id) {
      ctx.modules[id] = this;
      if (state === undefined) this.uri = ctx.uri(id);
    }
  }

  toUrl(id) {
    if (id.slice(-3) === '.js') {
      return this.ctx.uri(this.normalizeId(id.slice(0, -3)), '') + '.js';
    }
    return this.ctx.uri(this.normalizeId(id), '');
  }

  _ready() {
    if (this.body) {
      const oldCtx = Module.currentCtx;
      Module.currentCtx = this.ctx;
      try {
        runBody(this);
      } catch (ex) {
        ex.module = this;
        this._error(ex);
        if (this.state === ERROR) return;
      } finally {
        Module.currentCtx = oldCtx;
      }
    }

    const exportMap = this.ctx._exportMap;
    const exps = this.exports;
    if (exportMap && exps != null) {
      switch (typeof exps) {
      case 'object':
      case 'function':
        let list = exportMap.get(exps);
        if (list === undefined) {
          list = [this];
        } else {
          list.push(this);
        }

        exportMap.set(exps, list);
      }
    }

    delete this.ctx.waitReady[this.id];
    this.state = READY;
    this.plugin?.ready();
    informDependants(this);
  }

  _nodefine() {
    const {ctx} = this;
    const shim = ctx.shim?.[this.id];
    if (shim !== undefined && shim.expectDefine === undefined) {
      Module._prepare(this, shim.deps, shim.exports ?? (() => {}));
      return;
    }
    if (ctx.enforceDefine) {
      this._error(this.newError('Define not run', 'nodefine'));
    } else {
      Module._prepare(this);
    }
  }

  get require() {
    return this._require ??= buildRequire(this);
  }

  config() {
    return this.ctx.moduleConfig[this.id] ??= {};
  }

  get dir() {
    if (this._dir === undefined) {
      const ridx = this.id.lastIndexOf('/');
      this._dir = ridx === '-1' ? '' : this.id.slice(0, ridx + 1);
    }
    return this._dir;
  }

  normalizeId(id) {
    const {ctx} = this;
    const idMod = ctx.modules[id];
    if (idMod) return id;

    if (/(?:^(?:[a-z]+:\/)?\/|\.js$)/i.test(id)) {
      return id;
    }

    return ctx.normalizeId(id, id.charAt(0) === '.' ? this.dir : undefined);
  }

  get(id) {
    const {modules} = this.ctx;
    return modules[id] ?? modules[this.normalizeId(id)];
  }

  dependOn(id) {
    id = this.normalizeId(id);
    if (this.depCount == null) this.depCount = 0;
    const dMod = fetchModule(this.ctx, id, this);
    if (dMod === undefined || this.isUnloaded()) return;
    if (this._requires === undefined) {
      this._requires = {};
    }
    this._requires[dMod.id] = 1;
    return dMod;
  }

  isUnloaded() {return this.state === UNLOADED}

  unload() {
    if (this.isUnloaded()) return;

    const {ctx} = this;
    const {modules} = ctx;
    delete modules[this.id];
    for (const id in this._requires) {
      const depon = modules[id];
      if (depon !== undefined) {
        delete depon._requiredBy[this.id];
      }
    }
    ctx.depCount -= this.depCount;
    this.depCount = 0;
    this._requires = undefined;
    isReady(this); // assert depCount >= 0
    if (this.id) {
      delete ctx.waitReady[this.id];
      if (this.state < LOADED) {
        --ctx.resolvingCount;
      }
    }
    this.state = UNLOADED;
    if (this._unloads !== undefined) for (const cb of this._unloads) {
      typeof cb === 'function' ? cb(this) : cb.stop();
    }
    for (const id in this._requiredBy) {
      const subm = modules[id];
      subm === undefined || subm.unload();
    }
    this.uri !== undefined && ctx.undef(this);
  }

  onUnload(callback) {
    if (typeof callback !== 'function' && typeof callback.stop !== 'function') {
      throw new Error('callback (or callback.stop) is not a function');
    }
    if (this._unloads === undefined) {
      this._unloads = [callback];
    } else {
      this._unloads.push(callback);
    }
  }

  newError(message, attr) {
    const ex = new Error('Module: ' + this.id + ' - ' + message);
    if (attr) ex[attr] = true;
    ex.module = this;
    return ex;
  }

  _error(error, tracking) {
    const nested = tracking !== undefined;
    if (! nested) {
      tracking = {}; // me might have cycles
    }

    tracking[this.id] = 1;

    try {
      this.prevState = this.state;
      this.state = ERROR;
      let errorError;
      if (this.onError) {
        errorError = null;
        try {
          this.onError.some((cb) => {
            cb(error, this);
            return this.state !== ERROR;
          });
        } catch (ex) {
          errorError = ex;
        }
      }
      if (this.state === ERROR) {
        const {modules} = this.ctx;
        for (const id in this._requiredBy) {
          const subm = modules[id];
          subm !== undefined && tracking[id] === undefined && subm._error(error, tracking);
        }
      }
      if (nested || this.state !== ERROR) return;
      if (this.ctx.onError) {
        this.ctx.onError(error, this, errorError);
      } else if (errorError) {
        throw errorError;
      } else if (errorError === undefined) {
        throw error;
      }
    } finally {
      if (this.state === ERROR) {
        this.state = this.prevState;
        this.prevState = this.onError = null;
        nested || this.unload();
      } else {
        this.prevState = null;
      }
    }
  }

  static _prepare(mod, deps, body, autoRequire) {
    if (typeof body !== 'function') {
      mod.exports = body;
    } else {
      mod.body = body;
      if (autoRequire) {
        mod.exports = {};
      } else if (deps?.length > 0) {
        mod.requireDeps = deps;
      }
    }

    const {ctx} = mod;
    if (mod.state !== READY_WAIT_PLUGIN) {
      mod.state = PREPARING;
    }

    ctx.waitReady[mod.id] = mod;

    if (deps) {
      for (let i = 0; i < deps.length; ++i) {
        const name = deps[i];
        if (/^(?:require|exports|module)$/.test(name)) {
          continue;
        }
        const dMod = mod.dependOn(name);
        if (dMod !== undefined && dMod.id !== '') deps[i] = dMod.id;
        if (mod.isUnloaded()) {
          return;
        }
      }
    }

    --ctx.resolvingCount;

    if (mod.state !== READY_WAIT_PLUGIN) {
      mod.state = LOADED;
      isReady(mod) && mod._ready();
    }
    ctx[paused$] || Module.breakCycle(ctx);
  }

  static pause(ctx) {
    if (ctx[paused$]) return;
    ctx[paused$] = true;
    ++ctx.loadingCount;
  }

  static unpause(ctx) {
    if (! ctx[paused$]) return;
    ctx[paused$] = false;
    const {modules} = ctx;
    for (const id in modules) {
      const mod = modules[id];
      switch (mod.state) {
      case LOADED:
        isReady(mod) && mod._ready();
        break;
      case LOADING:
        ctx.loadModule(mod);
        break;
      }
    }
    --ctx.loadingCount;
    Module.breakCycle(ctx);
  }
}

const UNLOADED = Module.UNLOADED = -2;
const ERROR = Module.ERROR = -1;
const INIT = Module.INIT = 0;
const LOADING = Module.LOADING = 1;
const WAIT_PLUGIN = Module.WAIT_PLUGIN = 2;
const PREPARING = Module.PREPARING = 3;
const READY_WAIT_PLUGIN = Module.READY_WAIT_PLUGIN = 4;
const LOADED = Module.LOADED = 5;
const READY = Module.READY = 6;

const fetchModule = (ctx, id, parent, callback, error) => {
  const named = callback === 'named';
  let mod = ctx.modules[id], match = null;
  if (mod !== undefined) {
    if (named) {
      if (mod.state > WAIT_PLUGIN) {
        throw mod.newError('Defined more than once');
      }

      return mod;
    }
  } else {
    match = /^([^!]+)!(.*)$/.exec(id);
    mod = match
      ? newResourceModule(ctx, match[1], match[2], parent, named ? id : undefined)
      : new Module(ctx, id);

    if (named) return mod;
  }

  if (callback) {
    if (mod.state === READY) {
      callback(mod.exports, mod);
    } else if (mod.callback) {
      mod.callback.push(callback);
    } else {
      mod.callback = [callback];
    }
  } else if (parent?.id && mod._requiredBy[parent.id] === undefined) {
    if (parent.state !== READY) {
      mod._requiredBy[parent.id] = 1;
      if (mod.state !== READY) {
        ++ctx.depCount;
        ++parent.depCount;
      }
    }
  }

  if (error) {
    if (mod.onError) {
      mod.onError.push(error);
    } else {
      mod.onError = [error];
    }
  }

  if (match != null) {
    if (mod.id && mod.state !== READY) {
      return fetchResourceModule(ctx, mod);
    }
  } else if (mod.state === INIT) {
    mod.state = LOADING;
    ctx[paused$] || ctx.loadModule(mod);
  }

  return mod;
};

const decDepCount = (mod) => {
  --mod.ctx.depCount;
  --mod.depCount;
  isReady(mod) && mod._ready();
};

const isReady = (mod) => {
  if (mod.depCount < 0 || mod.ctx.depCount < 0) {
    throw new Error('depCount below zero!');
  }
  return mod.depCount === 0 && mod.state === LOADED && ! mod.ctx[paused$];
};

const commentRe = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;
const requireRe = /(?:[^.]|^)\brequire\s*\(\s*(["'])([^\1\s)]+)\1\s*\)/g;

const define = Module.define = (name, deps, body) => {
  if (deps === undefined) {
    body = name; name = null;
  } else {
    if (body === undefined) {
      body = deps;
      if (typeof name === 'string') {
        deps = null;
      } else {
        deps = name; name = null;
      }
    }
  }
  let argc;
  if (deps == null && typeof body === 'function' && body.length) {
    deps = [];
    argc = body.length;

    body.toString()
      .replace(commentRe, '')
      .replace(requireRe, (match, quote, dep) => {deps.push(dep)});
  }
  if (typeof name === 'string') {
    Module._prepare(fetchModule(Module.currentCtx, name, null, 'named'), deps, body, argc);
    return;
  }
  Module._globalDefineResult = [name, deps, body, argc];
};
define.amd = {};

Module.breakCycle = (ctx) => {
  while (ctx.resolvingCount === 0 && ctx.loadingCount === 0 && ctx.depCount !== 0) {
    const perm = {};
    let link;
    for (const wm in ctx.waitReady) {
      link = findCycle(ctx.modules[wm], {}, perm);
      if (link !== undefined) break;
    }
    if (link !== undefined) {
      const mod = link[0];
      if (ctx.enforceAcyclic) {
        const error = mod.newError('Cycle detected to ' + link[1].id);
        mod._error(error);
        if (mod.isUnloaded()) {
          continue;
        }
      }
      mod._requires[link[1].id] = 0;
      link[1]._requiredBy[mod.id] = 0;

      decDepCount(mod);
    } else {
      throw new Error("Unexpected: Can't find cycle!");
    }
  }
};

const findCycle = (mod, temp, perm) => {
  const modId = mod.id;
  if (perm[modId]) return;
  temp[modId] = true;

  const {modules, waitReady} = mod.ctx;
  const reqs = mod._requires;
  try {
    for (const id in reqs) {
      if (! id || ! waitReady[id] || ! reqs[id]) continue;
      const child = modules[id];
      if (temp[id]) return [mod, child];
      return findCycle(child, temp, perm);
    }
  } finally {
    perm[modId] = true;
    temp[modId] = false;
  }
};

const runBody = (mod) => {
  let result;
  if (mod.requireDeps) {
    const args = mod.requireDeps; mod.requireDeps = null;
    const len = args.length = Math.min(mod.body.length, args.length);
    const {modules} = mod.ctx;
    for (let i = 0; i < len; ++i) {
      const rId = args[i];
      switch (rId) {
      case 'require': args[i] = mod.require; break;
      case 'exports': args[i] = mod.exports = {}; break;
      case 'module': args[i] = mod; break;
      default:
        args[i] = fetchModule(mod.ctx, rId, mod).exports;
      }
    }
    result = mod.body.apply(globalThis, args);
  } else if (mod.exports) {
    result = mod.body.call(globalThis, mod.require, mod.exports, mod);
  } else {
    mod.exports = mod.body.call(globalThis);
  }
  if (result !== undefined) {
    mod.exports = result;
  }
};

const informDependants = Module._informDependants = (mod) => {
  const {waitReady} = mod.ctx;
  for (const id in mod._requiredBy) {
    const subm = waitReady[id];
    subm === undefined || decDepCount(subm);
  }
  if (mod.callback) {
    mod.callback.forEach((cb) => {cb(mod.exports, mod)});
    mod.callback = null;
  }
};

const buildRequire = (mod) => {
  const {ctx} = mod;
  const require = (id, callback, error) => {
    if (Array.isArray(id)) {
      const results = {};
      let errorValue;
      const ids = id.map((id) => mod.normalizeId(id));
      let count = ids.length;
      let finished = () => {
        finished = null;
        try {
          if (errorValue) {
            error(errorValue);
          } else {
            callback.apply(mod, ids.map((id) => results[id]));
          }
        } catch (ex) {
          if (ctx.onError) {
            ctx.onError(errorValue ?? ex, mod, ex);
          } else {
            throw ex;
          }
        }
      };
      const success = (value, subMod) => {
        results[subMod.id] = value;
        --count === 0 && finished();
      };

      const failure = error
            ? (value, mod) => {
              errorValue ??= value ?? mod.newError('unexpected error');
              --count === 0 && error(errorValue);
            }
            : undefined;
      ids.forEach((id) => {
        --count;
        switch (id) {
        case 'require': results[id] = mod.require; return;
        case 'exports': results[id] = mod.exports; return;
        case 'module': results[id] = mod; return;
        }
        ++count;
        fetchModule(ctx, id, mod, success, failure);
      });
      if (count === 0 && finished !== null) finished();
      return;
    }
    return fetchModule(ctx, mod.normalizeId(id), mod, callback, error).exports;
  };
  require.module = mod;
  require.toUrl = toUrl;
  return require;
};

function toUrl(path) {return this.module.toUrl(path)}

class Plugin {
  constructor(mod) {
    this.mod = mod;
    mod.plugin = this;
    this.waiting = {};
  }

  fetch(name, parent, mod) {
    const pluginMod = this.mod;
    if (pluginMod.state === READY) {
      name = this.normName(name, parent);
      const id = pluginMod.id + '!' + name;
      const {modules} = pluginMod.ctx;
      const resMod = modules[id];
      if (resMod !== undefined) {
        return resMod;
      }

      mod = new Module(pluginMod.ctx, id, WAIT_PLUGIN);
      return mod;
    }
    const parentId = parent ? parent.id : '';
    const parents = this.waiting[parentId] ??= {};
    const args = parents[name];
    if (args !== undefined) return args[1];
    if (mod === undefined) {
      mod = new Module(pluginMod.ctx, '', WAIT_PLUGIN);
    }
    parents[name] = [parent, mod];
    return mod;
  }

  normName(name, parent) {
    const loader = this.mod.exports;
    if (parent) {
      return loader.normalize
        ? loader.normalize(name, (id) => parent.normalizeId(id), parent)
        : parent.normalizeId(name);
    }
    return name;
  }

  load(name, mod) {
    if (mod.state >= PREPARING) return;
    mod.ctx.waitReady[mod.id] = mod;
    mod.state = PREPARING;
    const loader = this.mod.exports;
    const onLoad = (value) => {
      if (mod.isUnloaded()) return;
      if (value !== undefined) mod.exports = value;
      mod.ctx.waitReady[mod.id] = mod;
      --mod.ctx.resolvingCount;
      mod.state = LOADED;
      isReady(mod) && mod._ready();
      Module.breakCycle(mod.ctx);
    };
    onLoad.error = (error) => {mod._error(error)};
    loader.load(name, mod.require, onLoad);
  }

  ready() {
    const {waiting} = this;
    this.waiting = null;
    const resolved = {};
    for (const pId in waiting) {
      const mods = waiting[pId];
      for (const id in mods) {
        const args = mods[id];
        const name = this.normName(id, args[0]);
        let curr = args[1];
        let mod = resolved[name];
        if (mod !== undefined) {
          if (curr === mod) continue;
          if (curr.id) {
            resolved[name] = curr; curr = mod; mod = resolved[name];
          }
          for (const id in curr._requiredBy) {
            mod._requiredBy[id] = 1;
          }
          if (curr.callback) {
            if (mod.callback) {
              curr.callback.forEach((arg) => {mod.callback.push(arg)});
            }
            if (mod.error) {
              curr.error.forEach((arg) => {mod.error.push(arg)});
            }
          }
        } else {
          resolved[name] = curr;
        }
      }
    }

    const pluginPrefix = this.mod.id + '!';

    for (const name in resolved) {
      const mod = resolved[name];
      if (mod.state === READY_WAIT_PLUGIN) {
        mod.state = LOADED;
        isReady(mod) && mod._ready();
      } else {
        mod.id = pluginPrefix + name;
        mod.ctx.modules[mod.id] = mod;
        this.load(name, mod);
      }
    }
  }
}

Module.Plugin = Plugin;

const newResourceModule = (ctx, pluginId, name, parent, id) => {
  const {modules} = ctx;
  let pMod = modules[pluginId];
  if (pMod == undefined) {
    pMod = new Module(ctx, pluginId);
    pMod.state = LOADING;
    ctx[paused$] || ctx.loadModule(pMod);
  }
  let mod;
  if (id !== undefined) {
    mod = new Module(ctx, id);
    if (pMod.state === READY) {
      return mod;
    }
    mod.state = READY_WAIT_PLUGIN;
  }
  return (pMod.plugin ?? new Plugin(pMod)).fetch(name, parent, mod);
};

const fetchResourceModule = (ctx, mod) => {
  const {modules} = ctx;
  const match = mod.id.split('!');
  const pMod = modules[match[0]];
  if (pMod.state === READY) {
    pMod.plugin.load(match[1], mod);
  }

  return mod;
};

module.exports = Module;
