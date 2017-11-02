define(function(require, exports, module) {
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const DomTemplate     = require('koru/dom/template');
  const fst             = require('koru/fs-tools');
  const BaseController  = require('koru/server-pages/base-controller');
  const util            = require('koru/util');

  const path            = requirejs.nodeRequire('path');

  const views$ = Symbol(), defaultLayout$ = Symbol();

  const genericLayout = {$render({content}) {
    return Dom.h({html: {body: content}});
  }};

  Dom.registerHelpers({
    less(file) {
      const {App} = this.controller;
      const dir = path.join(App._pageDirPath, path.dirname(file)), base = path.basename(file)+".less";
      try {
        return Compilers.read('less', path.join(dir, base), path.join(dir, '.build', base+".css"));
      } catch(ex) {
        if (ex.error === 404) return;
      }
    },

    page() {
      return this.controller.pathParts[0] || "index";
    },
  });

  const addViewController = (sp, name, View, Controller)=>{
    View.Controller = Controller;
    View.Controller.App = sp;
    Controller.View = View;
    sp[views$][name] = View;
  };

  const removeViewController = (sp, name)=>{
    sp[views$][name] = undefined;
  };

  const requirePage = (id, {onunload}={})=>{
    const htmlId = `koru/html!${id}`;
    let View, Controller;

    require([id, htmlId], (tplf, html) => {
      const controllerMod = module.get(id);
      const viewMod = module.get(htmlId);
      View = DomTemplate.newTemplate(viewMod, html);
      Controller = tplf({View, Controller: BaseController});
      const unload = ()=>{
        koru.unload(controllerMod.id);
        koru.unload(viewMod.id);
        if (onunload !== undefined) onunload();
      };
      koru.onunload(viewMod, unload);
      koru.onunload(controllerMod, unload);
    });
    return {View, Controller};
  };

  const fetchView = (sp, parts, pos=0, views=sp[views$], root=sp._pageDirPath)=>{
    while (pos < parts.length && ! parts[pos]) ++pos;
    const key = parts[pos];
    let view = views[key];
    if (view === undefined) {
      const fn = path.resolve(root, key) + ".js";
      const stfn = fst.stat(fn);
      if (stfn != null) {
        const id = sp._pageDir+parts.slice(0, pos+1).join('/');
        const {View, Controller} = requirePage(id, {onunload() {removeViewController(sp, key)}});
        addViewController(sp, key, View, Controller);
        view = views[key];
      }
    }
    return {view, pathParts: parts.slice(pos+1)};
  };

  class ServerPages {
    constructor(WebServer, pageDir='server-pages', pathRoot='DEFAULT') {
      this._pageDir = pageDir;
      this._pageDirPath = path.join(koru.appDir, pageDir);
      this._pathRoot = pathRoot;
      this.WebServer = WebServer;
      const defaultLayoutId = path.join(pageDir, "layouts/default");
      this[defaultLayout$] = fst.stat(path.join(koru.appDir, defaultLayoutId+".js"))
        ? requirePage(defaultLayoutId).View : genericLayout;

      this[views$] = {};
      this._handleRequest = (request, response, urlPath)=>{
        const searchIdx = urlPath.indexOf('?');
        const parts = (searchIdx == -1 ? urlPath : urlPath.slice(0, searchIdx))
              .split('/').map(i => util.decodeURIComponent(i)), plen = parts.length;
        const suffixIdx = plen == 0 ? '' : parts[plen-1].search(/\.[^.]+$/);
        if (suffixIdx == -1) {
          this.suffix = 'html';
        } else {
          this.suffix = parts[plen-1].slice(suffixIdx+1);
          parts[plen-1] = parts[plen-1].slice(0, suffixIdx);
        }
        const {view, pathParts} = fetchView(
          this, parts);
        if (view === undefined) return false;
        const params = searchIdx == -1 ? {}
              : util.searchStrToMap(urlPath.slice(searchIdx+1));
        new view.Controller({request, response, pathParts, params});
      };
      WebServer.registerHandler(module, pathRoot, this._handleRequest);
    }

    get BaseController() {return BaseController}

    get defaultLayout() {return this[defaultLayout$]}
    set defaultLayout(value) {this[defaultLayout$] = value || genericLayout}

    addViewController(name, View, Controller) {
      addViewController(this, name, View, Controller);
    }

    stop() {
      this.WebServer.deregisterHandler(this._pathRoot);
    }
  }

  return ServerPages;
});
