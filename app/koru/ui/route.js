define(function(require, exports, module) {
  const Dom         = require('koru/dom');
  const koru        = require('koru/main');
  const makeSubject = require('koru/make-subject');
  const Trace       = require('koru/trace');
  require('koru/ui/dom-ext');
  const util        = require('koru/util');

  const excludes = Object.freeze({append: 1, href: 1, hash: 1, search: 1});
  var inGotoPage = 0;
  var currentPage = null;
  var targetPage = null;
  var currentPageRoute = {};
  var currentTitle, currentHref;
  var pageState = 'pushState';
  var pageCount = 0;
  var runInstance; // used with async callbacks

  var debug_page = false;
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
        var timeout = koru.setTimeout(function () {
          handle.stop();
          reject(new Error('Timed out waiting for: ' + (expectPage && expectPage.name) +
                           ' after ' + duration + 'ms'));
        }, duration);
        var handle = Route.onChange(function (actualPage, pageRoute, href) {
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

    static abortPage(location) {
      if (inGotoPage) {
        var abort = {};
        abort.location = location;
        abort.abortPage = true;
        throw abort;
      }

      return this.replacePath.apply(this, arguments);
    }

    static _reset() {
      Route.replacePage();
      pageCount = 0;
    }

    static replacePage() {
      pageState = 'replaceState';
      try {
        return this.gotoPage.apply(this, arguments);
      } finally {
        pageState = 'pushState';
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

      if (page && page.routeOptions && ! page.routeOptions.publicPage && ! koru.userId() && page !== Route.SignInPage) {
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
          if (! page) {
            var href = null;
            var title = Route.title;
            pageRoute = {};
          } else {
            page = page.Index || page;
            var href = Route.pageRouteToHref(page.onEntry && page.onEntry(page, pageRoute) || pageRoute);
            var title = page.title || Route.title;
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

    static recordHistory(page, href, pageRoute) {
      if (! Route.history) return;
      if (! pageState || (page && page.noPageHistory))
          return;
      if (currentHref === href)
        var cmd = 'replaceState';
      else {
        cmd = pageState;
        ++pageCount;
      }
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
      let href = typeof pageRoute ==='string' ? pageRoute : pageRoute.pathname+(pageRoute.search||'')+(pageRoute.hash||'');
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
      pageState = null;
      try {
        return this.gotoPath();
      } finally {
        pageState = 'pushState';
      }
    }

    static replacePath() {
      pageState = 'replaceState';
      try {
        return this.gotoPath.apply(this, arguments);
      } finally {
        pageState = 'pushState';
      }
    }

    static gotoPath(page) {
      var pageRoute = {};
      if (page == null)
        page = koru.getLocation();

      if (typeof page !== 'string') {
        if (! page.pathname)
          return this.gotoPage.apply(this, arguments);

        if (page.pathname !== '/') {
          page = this.pageRouteToHref(page);
        } else {
          page = page.hash || '/';
        }
      } else {
        page = decodeURIComponent(page);
      }


      var m = /^\/?#([^?#]*)(\?[^#]*)?(#.*)?$/.exec(page) || /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(page);
      if (m) {
        page = m[1] || '/';
        if (m[2]) pageRoute.search = m[2];
        if (m[3]) pageRoute.hash = m[3];
      }
      pageRoute.pathname = page;

      var parts = page.split('/');
      var root = this.root;
      page = root;

      var newPage = root.defaultPage;
      for(var i = 0; i < parts.length; ++i) {
        var part = parts[i];
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
      var result = {};

      var search = pageRoute && pageRoute.search;
      if (! search) return result;


      util.forEach(search.slice(1).split('&'), function (pair) {
        var items = pair.split('=');
        result[items[0]] = items[1];
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
      var path = options && options.path;
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

      var path = template.$path || (template.$path = templatePath(template));

      if (template.route) throw new Error(template.name + ' is already a route base');
      if (this.routes.path) throw new Error('Path already exists! ', path + " for template " + this.path);

      return template.route = this.routes[path] = new Route(path, template, this, options);
    }

    removeBase(template) {
      template.route = null;
      this.routes[template.$path] = null;
    }

    onBaseExit(page, location) {
      var template = this.template;
      var onBaseExit = template && template.onBaseExit;
      onBaseExit && onBaseExit.call(template, page, location);
    }

    onBaseEntry(page, location, callback) {
      var template = this.template;
      var onBaseEntry = template && template.onBaseEntry;
      onBaseEntry && onBaseEntry.call(template, page, location, callback);
    }
  };

  makeSubject(Route);

  Route.title = document.title;

  Route.history = window.history;

  function addCommon(route, module, template, options) {
    if (module) koru.onunload(module, function () {
      route.removeTemplate(template, options);
    });
    options = options || {};
    var path = options.path;
    if (path == null) path = templatePath(template);
    if (route.routes.path) throw new Error('Path already exists! ' + path + " for template " + this.path);
    route.routes[path] = template;
    template.route = route;
    template.subPath = path;
    template.routeOptions = options;

    if (options.defaultPage)
      route.defaultPage = template;

    return options;
  }

  util.extend(Route, {
    root: new Route(),
    pathname,
  });

  function exitEntry(exit, oldSymbols, entry, pageRoute, page, then) {
    var entryLen = entry.length;
    var exitLen = exit.length;
    var diff = exitLen - entryLen;
    var index, sym, item;

    for(--exitLen; exitLen >= 0; --exitLen) {
      item = exit[exitLen];
      if (item !== entry[exitLen - diff] ||
          ((sym = item.routeVar) && oldSymbols[sym] !== pageRoute[sym]))
        break;
    }

    for(index = 0;index < diff; ++index) {
      var tpl = exit[index];
      tpl.onBaseExit && tpl.onBaseExit(page, pageRoute);
    }

    for(;index <= exitLen; ++index) {
      var tpl = exit[index];
      tpl.onBaseExit && tpl.onBaseExit(page, pageRoute);
    }

    currentPage = exit[index];

    index = index - diff - 1 ;
    var runInstanceCopy = runInstance = {};
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
    if (template && template.route) {
      var path = routePath(template.route, pageRoute);
      if (template.subPath)
        path += '/'+template.subPath;
    } else
      var path = '';

    if (pageRoute.append)
      return path + '/' + pageRoute.append;

    return path;
  }

  function routePath(route, pageRoute) {
    if (! route) return '';

    var path = route.path;
    var routeVar = route.routeVar && pageRoute[route.routeVar];
    if (routeVar)
      path += '/' + routeVar;

    if (! route.parent) return path;
    return routePath(route.parent, pageRoute)+'/'+path;
  }

  function toPath(page) {
    if (page) {
      if (page.noParentRoute)
        return [];
      var route = page.$autoRender ? page.route : page;
    }
    var path = [];
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
      let parent;

      if (options) {
        if (typeof options.data ==='function') {
          var data = options.data.apply(page, arguments);
        } else {
          var data = options.data;
        }
      }
      page._renderedPage = page.$autoRender(data||{});
      if (options.insertPage) {
        options.insertPage(page._renderedPage);
      } else {
        var route = page.route;

        if (route && route.template) {
          parent = document.getElementById(route.template.name);
          if (parent)
            parent = parent.getElementsByClassName('body')[0] || parent;
        }
        (parent || document.body).appendChild(page._renderedPage);
      }
      if (options.focus) {
        Dom.focus(page._renderedPage, options.focus);
      }
      options.afterRendered && options.afterRendered.call(page, page._renderedPage, pageRoute);
    };
  }

  function autoOnExit() {
    Dom.remove(this._renderedPage || document.getElementById(this.name));
  }

  return Route;
});
