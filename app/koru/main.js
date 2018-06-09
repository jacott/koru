define(function (require, exports, module) {
  const KoruError       = require('koru/koru-error');
  const util            = require('./util');

  function reload(mod) {
    console.log(`Unloading ${mod.id}`);
    return koru.reload();
  }

  const onunload = (moduleOrId, callback)=>{
    if (callback === 'reload')
      callback = reload;
    const subm = typeof moduleOrId === 'string' ?
            module.ctx.modules[moduleOrId] : moduleOrId;
    if (subm == null)
      throw new Error('module not found! '+ moduleOrId);
    subm.onUnload(typeof callback === 'function' ? callback : callback.stop);
  };

  const fetchDependants = (mod, result)=>{
    if (! result) result = {};
    if (! mod || result[mod.id]) return result;
    result[mod.id] = true;
    const modules = mod.ctx.modules;
    const deps = mod._requiredBy;
    for (let id in deps) {
      const map = {};
      fetchDependants(modules[id], result);
    }
    return result;
  };

  const logDebug = (...args)=>{
    const nargs = new Array(args.length + 1);
    nargs[0] = '\x44EBUG';
    for(let i = 0; i < args.length; ++i) nargs[i+1] = args[i];

    koru.logger.apply(koru, nargs);
  };

  logDebug.inspect = (...args)=>{
    koru.logger('\x44EBUG ', args.map(o => util.inspect(o)).join(', '));
  };

  const koru = {
    onunload,

    PROTOCOL_VERSION: 5,

    unload: (id)=>{
      const mod = module.ctx.modules[id];
      mod && mod.unload();
    },

    config: module.config(),

    throwConfigMissing: name=>{
      throw new Error(module.id + ' config is missing for: ' + name);
    },

    throwConfigError: (name, reason)=>{
      throw new Error(module.id + ' config for ' + name + ' is mis-configured: ' + reason);
    },

    replaceProperty: (object, prop, newValue)=>{
      const oldValue = Object.getOwnPropertyDescriptor(object, prop);
      if (! oldValue) {
        newValue.writeable === undefined && (newValue.writeable = true);
        newValue.enumerable === undefined && (newValue.enumerable = true);
        newValue.configurable === undefined && (newValue.configurable = true);
      }
      Object.defineProperty(object, prop, newValue);
      return oldValue;
    },

    Error: KoruError,
    util,

    absId: (require, id) => require.module.normalizeId(id),

    clearTimeout: handle => clearTimeout(handle),

    "\x64ebug": logDebug,

    info: (...args)=>{koru.logger('INFO', args.join(' '))},

    error: (...args)=>{koru.logger('ERROR', args.join(' '))},

    unhandledException: ex =>{koru.error(util.extractError(ex))},

    logger: (...args)=>{console.log(...args)},

    globalCallback: (err, result)=>{
      if (err)
        koru.globalErrorCatch ? koru.globalErrorCatch(err) : koru.error(err);
    },

    userId: ()=> util.thread.userId,

    getHashOrigin: ()=>{
      const l = koru.getLocation();
      return l.protocol+'//'+l.host+l.pathname;
    },

    nullFunc: ()=>{},

    buildPath: (path)=>{
      let idx = path.lastIndexOf('/');
      if (idx === -1)
        return '.build/' + path;

      return path.slice(0, ++idx) + '.build/' + path.slice(idx);
    },

    fetchDependants,
  };

  require('koru/env!./main')(koru);

  return koru;
});
