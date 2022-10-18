(() => {
  if (window.globalThis === undefined) {
    window.globalThis = window;
  }

  ___INSERT___;

  Context.Module = Module;

  let pendingCounter = 0;

  const module$ = Symbol();

  Context.prototype.loadModule = (mod) => {
    const node = document.createElement('script');
    node.async = true;
    node.charset = 'utf-8';
    mod.node = node;
    node.setAttribute('src', mod.uri);
    node[module$] = mod;
    node.addEventListener('load', onLoad);
    if (++pendingCounter === 1) {
      window.addEventListener('error', onLoad, true);
    }

    ++mod.ctx.loadingCount;
    document.head.appendChild(node);
  };

  Context.prototype.undef = (mod) => {
    mod.node !== undefined &&
      mod.node.parentNode.removeChild(mod.node);
  };

  window.define = Module.define;

  const loadComplete = (mod, event) => {
    if (mod.state > Module.LOADING || mod.state < 0) {
      return;
    }

    if (event.type === 'error') {
      const error = mod.newError(event.message ?? 'failed to load', event.message ?? 'onload');
      error.event = event;
      mod._error(error);
      return;
    }

    const gdr = Module._globalDefineResult;
    Module._globalDefineResult = undefined;
    if (gdr !== undefined) {
      Module._prepare(mod, gdr[1], gdr[2], gdr[3]);
    } else {
      return mod._nodefine();
    }
  };

  const onLoad = (event) => {
    let script = event.target === window ? null : event.target;
    if (script == null) {
      const fn = event.filename;
      if (fn != null) {
        const scripts = document.head.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; ++i) {
          script = scripts[i];
          if (script[module$] !== undefined && script.src === fn) {
            break;
          }
        }
      }
      if (script == null) return;
    }
    const mod = script[module$];
    if (mod === undefined) return;
    script[module$] = undefined;
    script.removeEventListener('load', onLoad);
    if (--pendingCounter === 0) {
      window.removeEventListener('error', onLoad, true);
    }
    loadComplete(mod, event);

    if (--mod.ctx.loadingCount === 0) {
      Module.breakCycle(mod.ctx);
    }
  };

  let mainModuleId = document.querySelector('script[data-main]')?.getAttribute('data-main');
  let baseUrl;
  if (mainModuleId != null) {
    const slashPos = mainModuleId.lastIndexOf('/');
    baseUrl = slashPos === -1 ? '.' : mainModuleId.slice(0, slashPos);
    mainModuleId = mainModuleId.slice(slashPos + 1).replace(/\.js$/, '');
  }
  const mainCtx = Module.currentCtx = new Context({baseUrl: baseUrl ?? './'});

  window.requirejs = mainCtx.require;
  window.requirejs.config = mainCtx.config.bind(mainCtx);

  if (mainModuleId != null) {
    Module.pause(mainCtx);
    mainModuleId = mainCtx.normalizeId(mainModuleId);
    setTimeout(() => {
      if (! mainCtx.modules[mainModuleId]) {
        mainCtx.loadModule(new Module(mainCtx, mainModuleId));
      }
      Module.unpause(mainCtx);
    }, 0);
  }
})();
