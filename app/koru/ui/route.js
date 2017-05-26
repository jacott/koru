define(function(require, exports, module) {
  const Dom         = require('koru/dom');
  const koru        = require('koru/main');
  const makeSubject = require('koru/make-subject');
  const Trace       = require('koru/trace');
  require('koru/ui/dom-ext');
  const util        = require('koru/util');

  const excludes = Object.freeze({append: 1, href: 1, hash: 1, search: 1});
  let inGotoPage = 0;
  let currentPage = null;
  let targetPage = null;
  let currentPageRoute = {};
  let currentTitle, currentHref;
  let pageState = 'pushState';
  let pageCount = 0;
  let runInstance; // used with async callbacks

  let debug_page = false;
  Trace.debug_page = function (value) {
    debug_page = value;
  };

  class Route {
    constructor(path, template, parent, options) {
      if (typeof options === 'string') {
        this.routeVar = options;
        options = {};
      } else {
        const routeVar = options && options.routeVar;
        if (routeVar) this.routeVar = routeVar;
      }

      this.path = path || '';
      this.template = template;
      this.parent = options && options.hasOwnProperty('parent') ? options.parent : parent;
      this.routes = {};

      util.reverseMerge(this, options);
    }

    static get pageState() {return pageState;}
    static get pageCount() {return pageCount;}

    static waitForPage(expectPage, duration) {
      duration = duration || 2000;
      return new Promise(function (resolve, reject) {
        if (currentPage === expectPage) {
          resolve(currentPage, currentHref);
          return;
        }
        let handle;
        const timeout = koru.setTimeout(function () {
          handle.stop();
          reject(new Error('Timed out waiting for: ' + (expectPage && expectPage.name) +
                           ' after ' + duration + 'ms'));
        }, duration);
        handle = Route.onChange(function (actualPage, pageRoute, href) {
          handle.stop();
          koru.clearTimeout(timeout);
          if (actualPage === expectPage)
            resolve(actualPage, href);
          else
            reject(new Error('expected page: ' + (expectPage && expectPage.name) +
                             ', got: ' + (actualPage && actualPage.name)));
        });
      });
    }

    static abortPage(location, ...args) {
      if (inGotoPage) {
        throw {location, abortPage: true};
      }

      return this.replacePath(location, ...args);
    }

    static _reset() {
      Route.replacePage();
      pageCount = 0;
    }

    static replacePage(...args) {
      const orig = pageState;
      pageState = pageState && 'replaceState';
      try {
        return this.gotoPage(...args);
      } finally {
        pageState = orig;
      }
    }

    static gotoPage(page, pageRoute) {
      if (page && ! page.onEntry) {
        page = (page.route ? page.route.defaultPage : page.defaultPage) || page;
      }

      pageRoute = util.reverseMerge(pageRoute || {},  currentPageRoute, excludes);
      pageRoute.pathname = pathname(page, pageRoute || {});

      debug_page && koru.logger('D', 'gotoPage', util.inspect(pageRoute, 2));

      Route.loadingArgs = [page, pageRoute];

      if (page && page.routeOptions && ! page.routeOptions.publicPage &&
          ! koru.userId() && page !== Route.SignInPage) {
        Route.replacePage(Route.SignInPage, {returnTo: Route.loadingArgs});
        return;
      }

      targetPage = page;

      if (page && page.isDialog) {
        try {
          page.onEntry(page, pageRoute);
        }
        catch(ex) {
          if (ex.abortPage) {
            ex.location && this.replacePath(ex.location);
            return;
          }
          koru.error(util.extractError(ex));
          throw ex;
        }

      } else try {
        ++inGotoPage;
        if (currentPage) {
          currentPage.onExit && currentPage.onExit(page, pageRoute);

          exitEntry(toPath(currentPage), currentPageRoute, toPath(page), pageRoute, page, then);
        } else {
          exitEntry([], {}, toPath(page), pageRoute, page, then);
        }

        function then() {
          let href, title;
          if (! page) {
            href = null;
            title = Route.title;
            pageRoute = {};
          } else {
            page = page.Index || page;
            href = Route.pageRouteToHref(page.onEntry && page.onEntry(page, pageRoute) || pageRoute);
            title = page.title || Route.title;
          }

          Route.recordHistory(page, href, pageRoute);
          currentHref = href;
          currentPage = page;
          Route.setTitle(title);
          Route.notify(page, pageRoute, href);
        }
      }
      catch(ex) {
        if (ex.abortPage) {
          ex.location && this.replacePath(ex.location);
          return;
        }
        throw ex;
      }
      finally {
        --inGotoPage;
        Route.loadingArgs = null;
        currentPageRoute = pageRoute;
      }
    }

    static recordHistory(page, href) {
      if (! Route.history || ! pageState || (page && page.noPageHistory))
        return;
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
        (Dom.setTitle && Dom.setTitle(title)) || title;
    }

    static pushCurrent() {
      Route.history.pushState(++pageCount, null, currentHref);
    }

    static pageRouteToHref(pageRoute) {
      let href = typeof pageRoute ==='string' ? pageRoute :
            pageRoute.pathname+(pageRoute.search||'')+(pageRoute.hash||'');
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

      if (newRef === currentHref)
        return;

      currentHref = newRef;
      const orig = pageState;
      pageState = null;
      try {
        return this.gotoPath(location);
      } finally {
        pageState = orig;
      }
    }

    static overrideHistory(state, body) {
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
      pageState = pageState && 'replaceState';
      try {
        return this.gotoPath(...args);
      } finally {
        pageState = orig;
      }
    }

    static gotoPath(page, ...args) {
      const pageRoute = {};
      if (page == null)
        page = koru.getLocation();

      if (typeof page !== 'string') {
        if (! page.pathname)
          return this.gotoPage(page, ...args);

        if (page.pathname !== '/') {
          page = this.pageRouteToHref(page);
        } else {
          page = page.hash || '/';
        }
      } else {
        page = decodeURIComponent(page);
      }


      const m = /^\/?#([^?#]*)(\?[^#]*)?(#.*)?$/.exec(page) ||
        /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(page);
      if (m) {
        page = m[1] || '/';
        if (m[2]) pageRoute.search = m[2];
        if (m[3]) pageRoute.hash = m[3];
      }
      pageRoute.pathname = page;

      const parts = page.split('/');
      const root = this.root;
      page = root;

      let newPage = root.defaultPage;
      for(let i = 0; i < parts.length; ++i) {
        const part = parts[i];
        if (! part) continue;
        newPage = (page.routes && page.routes[part]);
        if (! newPage) {
          newPage = page.defaultPage;

          if (page.routeVar) {
            if (pageRoute[page.routeVar]) {
              pageRoute.append = parts.slice(i).join('/');
              break;
            }
            pageRoute[page.routeVar] = part;
            continue;
          }

        }

        if (! newPage) {
          pageRoute.append = parts.slice(i).join('/');
          break;
        }
        page = newPage;
      }

      if (newPage && newPage === root.defaultPage)
        page = newPage;

      if (page === root)
        throw new Error('Page not found: ' + util.inspect(pageRoute));

      this.gotoPage(page, pageRoute);
    }

    static searchParams(pageRoute) {
      const result = {};

      const search = pageRoute && pageRoute.search;
      if (! search) return result;


      util.forEach(search.slice(1).split('&'), pair => {
        const [name, value] = pair.split('=');
        result[name] = value;
      });

      return result;
    }




    addTemplate(module, template, options) {
      if (module && ! ('exports' in module)) {
        options = template;
        template = module;
        module = null;
      }
      options = addCommon(this, module, template, options);

      if (! template.onEntry)
        template.onEntry = onEntryFunc(options);

      if (! template.onExit)
        template.onExit = autoOnExit;
    }

    removeTemplate(template, options) {
      let path = options && options.path;
      if (path == null) path = templatePath(template);
      this.routes[path] = null;
      if (template.onEntry && template.onEntry.name === 'autoOnEntry')
        template.onEntry = null;
      if (template.onExit && template.onExit.name === 'autoOnExit')
        template.onExit = null;
    }

    addDialog(module, template, options) {
      if (module && ! module.exports) {
        options = template;
        template = module;
        module = null;
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
          koru.onunload(module, function () {
            this.removeBase(template);
          }.bind(this));
        } else {
          options = template;
          template = module;
          module = null;
        }
      }

      const path = template.$path || (template.$path = templatePath(template));

      if (template.route)
        throw new Error(template.name + ' is already a route base');
      if (this.routes.path)
        throw new Error(`Path already exists! ${path} for template ${this.path}`);

      return template.route = this.routes[path] = new Route(path, template, this, options);
    }

    removeBase(template) {
      template.route = null;
      this.routes[template.$path] = null;
    }

    onBaseExit(page, location) {
      const template = this.template;
      const onBaseExit = template && template.onBaseExit;
      onBaseExit && onBaseExit.call(template, page, location);
    }

    onBaseEntry(page, location, callback) {
      const template = this.template;
      const onBaseEntry = template && template.onBaseEntry;
      onBaseEntry && onBaseEntry.call(template, page, location, callback);
    }
  };

  Route.pageParent = null;

  makeSubject(Route);

  Route.title = document.title;

  Route.history = window.history;

  function addCommon(route, module, template, options) {
    if (module) koru.onunload(module, function () {
      route.removeTemplate(template, options);
    });
    options = options || {};
    let {path} = options;
    if (path == null) path = templatePath(template);
    if (route.routes.path)
      throw new Error(`Path already exists! ${path} for template ${this.path}`);
    route.routes[path] = template;
    template.route = route;
    template.subPath = path;
    template.routeOptions = options;

    if (options.defaultPage)
      route.defaultPage = template;

    return options;
  }

  Object.assign(Route, {
    root: new Route(),
    pathname,
  });

  function exitEntry(exit, oldSymbols, entry, pageRoute, page, then) {
    const entryLen = entry.length;
    let exitLen = exit.length;
    const diff = exitLen - entryLen;
    let index, sym, item;

    for(--exitLen; exitLen >= 0; --exitLen) {
      item = exit[exitLen];
      if (item !== entry[exitLen - diff] ||
          ((sym = item.routeVar) && oldSymbols[sym] !== pageRoute[sym]))
        break;
    }

    for(index = 0;index < diff; ++index) {
      const tpl = exit[index];
      tpl.onBaseExit && tpl.onBaseExit(page, pageRoute);
    }

    for(;index <= exitLen; ++index) {
      const tpl = exit[index];
      tpl.onBaseExit && tpl.onBaseExit(page, pageRoute);
    }

    currentPage = exit[index];

    index = index - diff - 1 ;
    let runInstanceCopy = runInstance = {};
    function callback() {
      if (runInstanceCopy !== runInstance)
        return; // route call overridden
      if (index < 0) {
        runInstanceCopy = null; // stop multi calling
        then();
        return true;
      }
      item = entry[index--];
      currentPage = item;
      if (item.async)
        item.onBaseEntry(page, pageRoute, callback);
      else {
        item.onBaseEntry && item.onBaseEntry(page, pageRoute);
        callback();
      }
    }
    callback();
  }

  function pathname(template, pageRoute) {
    let path = '';
    if (template && template.route) {
      path = routePath(template.route, pageRoute);
      if (template.subPath)
        path += '/'+template.subPath;
    }

    if (pageRoute.append)
      return path + '/' + pageRoute.append;

    return path;
  }

  function routePath(route, pageRoute) {
    if (! route) return '';

    let {path} = route;
    const routeVar = route.routeVar && pageRoute[route.routeVar];
    if (routeVar)
      path += '/' + routeVar;

    if (! route.parent) return path;
    return routePath(route.parent, pageRoute)+'/'+path;
  }

  function toPath(page) {
    let route;
    if (page) {
      if (page.noParentRoute)
        return [];
      route = page.$autoRender ? page.route : page;
    }
    const path = [];
    while(route) {
      path.push(route);
      route = route.parent;
    }
    return path;
  }

  function templatePath(template) {
    return util.dasherize(template.name);
  }

  function onEntryFunc(options) {
    return function autoOnEntry(page, pageRoute) {
      let parent, data;

      if (options) {
        if (typeof options.data ==='function') {
          data = options.data.call(page, page, pageRoute);
        } else {
          data = options.data;
        }
      }
      page._renderedPage = page.$autoRender(data||{});
      if (options.insertPage) {
        options.insertPage(page._renderedPage);
      } else {
        const {route} = page;

        if (route && route.template) {
          parent = document.getElementById(route.template.name);
          if (parent)
            parent = parent.getElementsByClassName('body')[0] || parent;
        }
        (parent || Route.pageParent || (Route.pageParent = document.body))
          .appendChild(page._renderedPage);
      }
      if (options.focus) {
        Dom.dontFocus || Dom.focus(page._renderedPage, options.focus);
      }
      options.afterRendered && options.afterRendered.call(page, page._renderedPage, pageRoute);
    };
  }

  function autoOnExit() {
    Dom.remove(this._renderedPage || document.getElementById(this.name));
  }

  return Route;
});
