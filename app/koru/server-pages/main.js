define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const Compilers       = require('koru/compilers');
  const Dom             = require('koru/dom');
  const Template        = require('koru/dom/template');
  const fst             = require('koru/fs-tools');
  const BaseController  = require('koru/server-pages/base-controller');
  const util            = require('koru/util');

  const $ = Dom.current;

  const path = requirejs.nodeRequire('path');

  const views$ = Symbol(), defaultLayout$ = Symbol();

  const genericLayout = {$render({content}) {
    return Dom.h({html: {body: content}});
  }};

  Dom.registerHelpers({});

  const addViewController = (sp, name, View, Controller) => {
    Controller.modId = name;
    View.Controller = Controller;
    Controller.App = sp;
    sp[views$][name] = View;
  };

  const removeViewController = (sp, name) => {
    sp[views$][name] = undefined;
  };

  const requirePage = async (id, {onunload}={}) => {
    let viewId = `koru/html-server!${id}`;
    const err = await new Promise((resolve, reject) => {
      require(viewId, () => resolve(), (err, mod) => {
        if (err.error !== 404) {
          resolve(err);
        } else {
          mod.unload();
          viewId = `koru/html-md!${id}`;
          require(viewId, () => resolve(), (err2) => {
            resolve(err2.error === 404 ? err : err2);
          });
        }
      });
    });
    if (err !== void 0) {
      if (err.error === 404) {
        throw new koru.Error(404, err.message);
      }
      throw new globalThis.AggregateError([err], err.message);
    }
    const viewMod = module.get(viewId);
    let View, Controller = BaseController;

    const tplf = await new Promise((resolve, reject) => {require(id, resolve, reject)});
    const controllerMod = module.get(id);
    View = Template.newTemplate(viewMod, viewMod.exports);
    if (typeof tplf === 'function') {
      Controller = tplf({View, Controller: BaseController}) || BaseController;
    }
    const unload = () => {
      koru.unload(controllerMod.id);
      koru.unload(viewMod.id);
      if (onunload !== undefined) onunload();
    };
    koru.onunload(viewMod, unload);
    koru.onunload(controllerMod, unload);

    return {View, Controller};
  };

  const fetchView = async (sp, parts, pos=0, views=sp[views$], root=sp._pageDirPath) => {
    while (pos < parts.length && ! parts[pos]) ++pos;
    const key = parts[pos] || '';
    let view = views[key];
    if (view === undefined && key.indexOf('.') === -1) {
      const fn = path.resolve(root, key) + '.js';
      const stfn = await fst.stat(fn);
      if (stfn != null) {
        const id = sp._pageDir + parts.slice(0, pos + 1).join('/');
        const {View, Controller} = await requirePage(id, {onunload() {removeViewController(sp, key)}});
        addViewController(sp, key, View, Controller);
        view = views[key];
      }
    }
    return {view, pathParts: parts.slice(pos + 1)};
  };

  const decodePathPart = (i) => {
    try {
      return util.decodeURIComponent(i) || '';
    } catch (ex) {
      return i;
    }
  };

  class ServerPages {
    static async build(WebServer, pageDir='server-pages', pathRoot='DEFAULT') {
      const sp = new this();
      sp._pageDir = pageDir;
      sp._pageDirPath = path.join(koru.appDir, pageDir);
      sp._pathRoot = pathRoot;
      sp.WebServer = WebServer;
      const defaultLayoutId = path.join(pageDir, 'layouts/default');
      sp[defaultLayout$] = (await fst.stat(path.join(koru.appDir, defaultLayoutId + '.js')))
        ? (await requirePage(defaultLayoutId)).View
        : genericLayout;

      sp[views$] = {};
      sp._handleRequest = async (request, response, urlPath) => {
        const searchIdx = urlPath.indexOf('?');
        const parts = (searchIdx == -1 ? urlPath : urlPath.slice(0, searchIdx))
              .split('/').map((i) => decodePathPart(i)), plen = parts.length;
        const suffixIdx = plen == 0 ? '' : parts[plen - 1].search(/\.[^.]+$/);
        if (suffixIdx == -1) {
          sp.suffix = 'html';
        } else {
          sp.suffix = parts[plen - 1].slice(suffixIdx + 1);
          parts[plen - 1] = parts[plen - 1].slice(0, suffixIdx);
        }
        const {view, pathParts} = await fetchView(sp, parts);
        if (view === undefined) return false;
        const params = searchIdx == -1
              ? {}
              : util.searchStrToMap(urlPath.slice(searchIdx + 1));
        await view.Controller.build({view, request, response, pathParts, params});
      };
      WebServer.registerHandler(module, pathRoot, sp._handleRequest);
      return sp;
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

  module.onUnload(koru.reload);

  return ServerPages;
});
