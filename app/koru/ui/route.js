define((require, exports, module) => {
  'use strict';
  const Dom             = require('koru/dom');
  const koru            = require('koru/main');
  const makeSubject     = require('koru/make-subject');
  const Trace           = require('koru/trace');
  const util            = require('koru/util');

  const {hasOwn} = util;

  const Module = module.constructor;

  const excludes = Object.freeze({append: 1, href: 1, hash: 1, search: 1});
  let inGotoPage = 0;
  let currentPage = null;
  let targetPage = null;
  let currentPageRoute = {};
  let currentTitle, currentHref;
  let pageState = 'pushState';
  let pageCount = 0;
  let runInstance = 0; // used with async callbacks

  let debug_page = false;
  Trace.debug_page = (value) => {debug_page = value};

  const exitEntry = (exit, oldSymbols, entry, pageRoute, page, then) => {
    const entryLen = entry.length;
    let exitLen = exit.length;
    const diff = exitLen - entryLen;
    let index, sym, item;

    for (--exitLen; exitLen >= 0; --exitLen) {
      item = exit[exitLen];
      if (item !== entry[exitLen - diff] ||
          ((sym = item.routeVar) !== void 0 && oldSymbols[sym] !== pageRoute[sym])) {
        break;
      }
    }

    for (index = 0; index < diff; ++index) {
      const tpl = exit[index];
      tpl.onBaseExit?.(page, pageRoute);
    }

    for (;index <= exitLen; ++index) {
      const tpl = exit[index];
      tpl.onBaseExit?.(page, pageRoute);
    }

    currentPage = exit[index];

    index = index - diff - 1;
    let runInstanceCopy = ++runInstance;
    const callback = () => {
      if (runInstanceCopy !== runInstance) {
        return // route call overridden
        ;
      } if (index < 0) {
        runInstanceCopy = 0; // stop multi calling
        then();
        return true;
      }
      item = entry[index--];
      currentPage = item;
      if (item.async) {
        item.onBaseEntry(page, pageRoute, callback);
      } else {
        item.onBaseEntry?.(page, pageRoute);
        callback();
      }
    };
    callback();
  };

  const pathname = (template, pageRoute) => {
    let path = '';
    if (template?.route !== void 0) {
      path = routePath(template.route, pageRoute);
      if (template.subPath) {
        path += '/' + template.subPath;
      }
    }

    if (pageRoute.append) {
      return path + '/' + pageRoute.append;
    }

    return path;
  };

  const routePath = (route, pageRoute) => {
    if (! route) return '';

    let {path} = route;
    const routeVar = route.routeVar !== void 0 && pageRoute[route.routeVar];
    if (routeVar) {
      path += '/' + routeVar;
    }

    if (route.parent === void 0) return path;
    return routePath(route.parent, pageRoute) + '/' + path;
  };

  const toPath = (page) => {
    let route;
    if (page) {
      if (page.noParentRoute) {
        return [];
      }
      route = page.$autoRender ? page.route : page;
    }
    const path = [];
    while (route) {
      path.push(route);
      route = route.parent;
    }
    return path;
  };

  const templatePath = (template) => util.dasherize(template.name);

  const onEntryFunc = (options) => {
    const autoOnEntry = (page, pageRoute) => {
      page._renderedPage = page.$autoRender((typeof options.data === 'function'
                                             ? options.data(page, pageRoute)
                                             : options.data) || {});
      if (options.insertPage !== void 0) {
        options.insertPage(page._renderedPage);
      } else {
        myAnchor(page.route).appendChild(page._renderedPage);
      }
      if (options.focus) {
        Dom.dontFocus || Dom.focus(page._renderedPage, options.focus);
      }
      options.afterRendered?.call(page, page._renderedPage, pageRoute);
    };
    autoOnEntry.isAuto = true;
    return autoOnEntry;
  };

  function autoOnExit() {
    Dom.remove(this._renderedPage || document.getElementById(this.name));
  }
  autoOnExit.isAuto = true;

  function addCommon(route, module, template, options={}) {
    if (module !== void 0) module.onUnload(() => {
      if (currentPage === template) {
        try {
          currentPage.onExit?.(currentPage, currentPageRoute);
        } catch (err) {
          koru.unhandledException(err);
        }
      }
      route.removeTemplate(template, options);
    });
    const path = options.path === void 0 ? templatePath(template) : options.path;
    if (route.routes.path !== void 0) {
      throw new Error(`Path already exists! ${path} for template '${this.path}'`);
    }
    route.routes[path] = template;
    if (template.route !== void 0) {
      throw new Error(template.name + ' is already added');
    }
    template.route = route;
    template.subPath = path;
    template.routeOptions = options;

    if (options.defaultPage) {
      route.defaultPage = template;
    }

    return options;
  }

  class AbortPage {
    constructor(location, args) {
      this.location = location;
      this.args = args;
    }
  }

  const handleAbortPage = (self, err) => {
    if (err.constructor === AbortPage) {
      pageState = 'pushState';
      err.location !== void 0 && self.replacePath(err.location, ...err.args);
      return;
    }
    koru.unhandledException(err);
    throw err;
  };

  class Route {
    constructor(path='', template, parent, options={}) {
      this.routeVar = options.routeVar;
      this.path = path;
      this.template = template;
      this.parent = ('parent' in options) ? options.parent : parent;
      this.routes = {};

      util.reverseMerge(this, options);
    }

    static get pageState() {return pageState;}
    static get pageCount() {return pageCount;}

    static waitForPage(expectPage, duration) {
      duration = duration || 2000;
      return new Promise((resolve, reject) => {
        if (currentPage === expectPage) {
          resolve(currentPage, currentHref);
          return;
        }
        let handle;
        const timeout = koru.setTimeout(() => {
          handle.stop();
          reject(new Error(`Timed out waiting for: ${expectPage?.name} after ${duration}ms`));
        }, duration);
        handle = Route.onChange((actualPage, pageRoute, href) => {
          handle.stop();
          koru.clearTimeout(timeout);
          if (actualPage === expectPage) {
            resolve(actualPage, href);
          } else {
            reject(new Error(`expected page: ${expectPage?.name}, got: ${actualPage?.name}`));
          }
        });
      });
    }

    static abortPage(location, ...args) {
      if (inGotoPage) {
        throw new AbortPage(location, args);
      }

      return this.replacePath(location, ...args);
    }

    static _reset() {
      Route.replacePage();
      pageCount = 0;
    }

    static replacePage(page, pageRoute) {
      const orig = pageState;
      pageState = pageState === null ? null : 'replaceState';
      try {
        return this.gotoPage(page, pageRoute);
      } finally {
        pageState = orig;
      }
    }

    static gotoPage(page, pageRoute) {
      if (page != null && page.onEntry === void 0) {
        page = page?.route?.defaultPage ?? page?.defaultPage ?? page;
      }

      pageRoute = util.reverseMerge(pageRoute || {}, currentPageRoute, excludes);
      pageRoute.pathname = pathname(page, pageRoute || {});

      debug_page && koru.logger('D', 'gotoPage', util.inspect(pageRoute, 2));

      Route.loadingArgs = [page, pageRoute];

      if (page?.routeOptions !== void 0 && ! page.routeOptions.publicPage &&
          koru.userId() == null && page !== Route.SignInPage) {
        Route.replacePage(Route.SignInPage, {returnTo: Route.loadingArgs});
        return;
      }

      targetPage = page;

      if (page?.isDialog) {
        try {
          page.onEntry(page, pageRoute);
        } catch (err) {
          handleAbortPage(this, err);
        }
      } else {
        try {
          ++inGotoPage;
          const then = () => {
            let href, title;
            if (page == null) {
              href = null;
              title = Route.title;
              pageRoute = {};
            } else {
              href = Route.pageRouteToHref(page.onEntry?.(page, pageRoute) ?? pageRoute);
              title = page.title ?? Route.title;
            }

            Route.recordHistory(page, href);
            currentHref = href;
            currentPage = page;
            Route.setTitle(title);
            Route.notify(page, pageRoute, href);
          };

          if (currentPage != null) {
            currentPage.onExit?.(page, pageRoute);

            exitEntry(toPath(currentPage), currentPageRoute, toPath(page), pageRoute, page, then);
          } else {
            exitEntry([], {}, toPath(page), pageRoute, page, then);
          }
        } catch (err) {
          handleAbortPage(this, err);
        } finally {
          --inGotoPage;
          Route.loadingArgs = null;
          currentPageRoute = pageRoute;
        }
      }
    }

    static recordHistory(page, href) {
      if (pageState === null || page?.noPageHistory) {
        return;
      }
      let cmd = 'replaceState';
      if (pageState !== cmd && currentHref !== href) {
        cmd = pageState;
        ++pageCount;
      }
      currentHref = href;
      Route.history[cmd](pageCount, null, href);
    }

    static setTitle(title) {
      currentTitle = document.title =
        (Dom.setTitle !== void 0 && Dom.setTitle(title)) || title;
    }

    static pushCurrent() {
      Route.history.pushState(++pageCount, null, currentHref);
    }

    static pageRouteToHref(pageRoute) {
      let href = typeof pageRoute === 'string'
          ? pageRoute
          : pageRoute.pathname + (pageRoute.search || '') + (pageRoute.hash || '');
      if (! /^\/#/.test(href)) href = '/#' + (href[0] === '/' ? href.slice(1) : href);
      return href;
    }

    static pushHistory(pageRoute) {
      currentPageRoute = pageRoute;
      currentHref = this.pageRouteToHref(pageRoute);
      this.pushCurrent();
    }
    static replaceHistory(pageRoute) {
      currentPageRoute = pageRoute;
      currentHref = this.pageRouteToHref(pageRoute);
      Route.history.replaceState(pageCount, null, currentHref);
    }

    static get targetPage() {return targetPage}
    static get currentPage() {return currentPage}
    static get currentPageRoute() {return currentPageRoute}
    static get currentHref() {return currentHref}
    static get currentTitle() {return currentTitle}

    static pageChanged(state) {
      pageCount = state || 0;
      const location = koru.getLocation();
      const newRef = location.href.slice(location.origin.length);

      if (newRef === currentHref) {
        return;
      }

      currentHref = newRef;
      const orig = pageState;
      pageState = null;
      try {
        return this.gotoPath(location);
      } finally {
        pageState = orig;
      }
    }

    static overrideHistory(state=null, body) {
      const orig = pageState;
      pageState = state;
      try {
        return body();
      } finally {
        pageState = orig;
      }
    }

    static replacePath(...args) {
      const orig = pageState;
      pageState = pageState === null ? null : 'replaceState';
      try {
        return this.gotoPath(...args);
      } finally {
        pageState = orig;
      }
    }

    static gotoPath(path, ...args) {
      const pageRoute = {};
      if (path == null) {
        path = koru.getLocation();
      }

      if (typeof path !== 'string') {
        if (! path.pathname) {
          return this.gotoPage(path, ...args);
        }

        if (path.pathname !== '/') {
          path = this.pageRouteToHref(path);
        } else {
          path = path.hash || '/';
        }
      } else {
        path = decodeURIComponent(path);
      }

      const page = this.pathToPage(path, pageRoute);

      if (page === void 0) {
        throw new koru.Error(404, 'Page not found: ' + path);
      }

      this.gotoPage(page, pageRoute);
    }

    static pathToPage(path, pageRoute) {
      let append;
      const m = /^\/?#([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path) ||
            /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path);
      if (m !== null) {
        path = m[1] || '/';
      }
      const parts = path.split('/');
      const {root} = this;
      let page = root;

      let newPage = root.defaultPage;
      for (let i = 0; i < parts.length; ++i) {
        const part = parts[i];
        if (part === '') continue;
        newPage = page?.routes?.[part];
        if (newPage === void 0) {
          newPage = page.defaultPage;

          if (page.routeVar !== void 0 && pageRoute !== void 0) {
            if (pageRoute[page.routeVar] === void 0) {
              pageRoute[page.routeVar] = part;
              continue;
            }
          }

          append = parts.slice(i).join('/');
          break;
        }
        page = newPage;
      }

      if (newPage !== void 0 && newPage === root.defaultPage) {
        page = newPage;
      }

      if (page === root) {
        return;
      }

      if (pageRoute !== void 0 && m !== null) {
        pageRoute.pathname = path;

        if (m[2] !== void 0) pageRoute.search = m[2];
        if (m[3] !== void 0) pageRoute.hash = m[3];
        if (append !== void 0) pageRoute.append = append;
      }

      return page;
    }

    static searchParams(pageRoute) {
      const result = {};

      const search = pageRoute?.search;
      if (! search) return result;

      util.forEach(search.slice(1).split('&'), (pair) => {
        const [name, value] = pair.split('=');
        result[name] = value;
      });

      return result;
    }

    addTemplate(module, template, options) {
      if (module !== void 0 && ! (module instanceof Module)) {
        options = template;
        template = module;
        module = void 0;
      }
      options = addCommon(this, module, template, options);

      if (! template.onEntry) {
        template.onEntry = onEntryFunc(options);
      }

      if (! template.onExit) {
        template.onExit = autoOnExit;
      }
    }

    removeTemplate(template, options={}) {
      const path = options.path ?? templatePath(template);
      this.routes[path] = void 0;
      template.route = void 0;
      if (template.onEntry?.isAuto) template.onEntry = void 0;
      if (template.onExit?.isAuto) template.onExit = void 0;
    }

    addDialog(module, template, options) {
      if (module !== void 0 && ! (module instanceof Module)) {
        options = template;
        template = module;
        module = void 0;
      }
      options = addCommon(this, module, template, options);

      template.isDialog = true;
    }

    addAlias(template, path) {
      this.routes[path] = template;
    }

    addBase(module, template, options) {
      if (module) {
        if ('exports' in module) {
          module.onUnload(() => {
            this.removeBase(template);
          });
        } else {
          options = template;
          template = module;
          module = null;
        }
      }

      if (options === void 0) options = {};

      const path = options.path === void 0 ? templatePath(template) : options.path;

      if (template.route !== void 0) {
        throw new Error(template.name + ' is already a route base');
      }

      return template.route = this.routes[path] = new Route(path, template, this, options);
    }

    removeBase(template) {
      template.route = void 0;
    }

    onBaseExit(page, pageRoute) {
      const template = this.template;
      if (template !== void 0) {
        (template.onBaseExit || defaultOnBaseExit).call(template, page, pageRoute);
      }
    }

    onBaseEntry(page, pageRoute, callback) {
      const template = this.template;
      if (template !== void 0) {
        (template.onBaseEntry || defaultOnBaseEntry).call(template, page, pageRoute, callback);
      }
    }
  }

  const myAnchor = (route) => route?.childAnchor ?? Route.childAnchor;

  function defaultOnBaseExit(page, pageRoute) {
    Dom.remove(this._renderedPage || document.getElementById(this.name));
  }

  function defaultOnBaseEntry(page, pageRoute, callback) {
    myAnchor(this.route.parent).appendChild(this.$autoRender());
    callback?.();
  }

  makeSubject(Route);

  Route.title = document.title;
  Route.history = window.history;

  Object.assign(Route, {
    root: new Route(),
    pathname,
  });

  Route.childAnchor = document.body;

  return Route;
});
