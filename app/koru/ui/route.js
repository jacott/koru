define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Dom = require('../dom');
  require('koru/ui/dom-ext');

  function Route(path, template, parent, routeVar) {
    this.path = path || '';
    this.template = template;
    this.parent = parent;
    this.routes = {};
    this.routeVar = routeVar;
  };

  Route.title = document.title;

  Route.history = window.history;

  Route.prototype = {
    constructor: Route,

    addTemplate: function (module, template, options) {
      if (module && ! ('exports' in module)) {
        options = template;
        template = module;
        module = null;
      }
      options = addCommon(this, module, template, options);
      if (! ('onEntry' in template))
        template.onEntry = onEntryFunc(template, options);

      if (! ('onExit' in template))
        template.onExit = onExitFunc(template);
    },

    removeTemplate: function (template, options) {
      var path = options && options.path;
      if (path == null) path = templatePath(template);
      delete this.routes[path];
    },

    addDialog: function (module, template, options) {
      if (module && ! ('exports' in module)) {
        options = template;
        template = module;
        module = null;
      }
      options = addCommon(this, module, template, options);

      template.isDialog = true;
    },

    addAlias: function (template, path) {
      this.routes[path] = template;
    },

    addBase: function (module, template, routeVar) {
      if (module) {
        if ('exports' in module) {
          koru.onunload(module, function () {
            this.removeBase(template);
          }.bind(this));
        } else {
          routeVar = template;
          template = module;
          module = null;
        }
      }
      if ('route' in template) throw new Error(template.name + ' is already a route base');
      var path = templatePath(template);
      if (path in this.routes) throw new Error('Path already exists! ', path + " for template " + this.path);

      return template.route = this.routes[path] = new Route(path, template, this, routeVar);
    },

    removeBase: function (template) {
      delete template.route;
      var path = templatePath(template);
      delete this.routes[path];
    },

    onBaseExit: function(page, location) {
      var template = this.template;
      var onBaseExit = template && template.onBaseExit;
      onBaseExit && onBaseExit.call(template, page, location);
    },

    onBaseEntry: function(page, location) {
      var template = this.template;
      var onBaseEntry = template && template.onBaseEntry;
      onBaseEntry && onBaseEntry.call(template, page, location);
    },
  };

  function addCommon(route, module, template, options) {
    if (module) koru.onunload(module, function () {
      route.removeTemplate(template, options);
    });
    options = options || {};
    var path = options.path;
    if (path == null) path = templatePath(template);
    if (path in route.routes) throw new Error('Path already exists! ' + path + " for template " + this.path);
    route.routes[path] = template;
    template.route = route;
    template.subPath = path;
    template.routeOptions = options;

    if (options.defaultPage)
      route.defaultPage = template;

    return options;
  }

  var inGotoPage = false;
  var currentPage = null;
  var currentPageRoute = {};
  var currentTitle, currentHref;
  var pageState = 'pushState';
  var excludes = {append: 1, href: 1, hash: 1, search: 1};

  util.extend(Route, {
    root: new Route(),

    _private: {
      get pageState() {return pageState},
    },

    abortPage: function (location) {
      if (inGotoPage) {
        var abort = {};
        abort.location = location;
        abort.abortPage = true;
        throw abort;
      }

      return this.replacePath.apply(this, arguments);
    },

    pathname: pathname,

    replacePage: function () {
      pageState = 'replaceState';
      return this.gotoPage.apply(this, arguments);
    },

    gotoPage: function (page, pageRoute) {
      if (page && ! ('onEntry' in page)) {
        if ('route' in page)
          page = page.route.defaultPage;
        else
          page = page.defaultPage;
      }

      pageRoute = util.reverseExtend(pageRoute || {},  currentPageRoute, excludes);
      pageRoute.pathname = pathname(page, pageRoute || {});

      Route.loadingArgs = [page, pageRoute];

      if (page && page.routeOptions && page.routeOptions.privatePage && ! koru.userId()) {
        Route.replacePage(Route.SignPage, {returnTo: Route.loadingArgs});
        return;
      }

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
        inGotoPage = true;
        if (currentPage) {
          currentPage.onExit && currentPage.onExit(page, pageRoute);

          exitEntry(toPath(currentPage.$autoRender ? currentPage.route : currentPage), currentPageRoute, toPath(page && page.route), pageRoute, page);
        } else {
          exitEntry([], {}, toPath(page && page.route), pageRoute, page);
        }

        if (! page) {
          var href = null;
          var title = document.title = Route.title;
          pageRoute = {};
        } else {
          page = page.Index || page;
          var href = page.onEntry(page, pageRoute) || pageRoute.pathname+(pageRoute.search||'')+(pageRoute.hash||'');
          var title = document.title = page.title || Route.title;
          Dom.setTitle && Dom.setTitle(page.title);
        }

        if (pageState &&
            (pageState !== 'pushState' || currentHref !== href) &&
            ! (page && ('noPageHistory' in page))) {
          currentHref = href;
          currentTitle = title;
          Route.history[pageState](null, title, href);
        }
        currentPage = page;
      }
      catch(ex) {
        inGotoPage = false;
        if (ex.abortPage) {
          ex.location && this.replacePath(ex.location);
          return;
        }
        throw ex;
      }
      finally {
        inGotoPage = false;
        Route.loadingArgs = null;
        pageState = 'pushState';
        currentPageRoute = pageRoute;
      }
    },

    pushCurrent: function () {
      Route.history.pushState(null, currentTitle, currentHref);
    },

    get currentPage() {
      return currentPage;
    },

    pageChanged: function () {
      pageState = null;
      return this.gotoPath();
    },

    replacePath: function () {
      pageState = 'replaceState';
      return this.gotoPath.apply(this, arguments);
    },

    gotoPath: function (page) {
      var pageRoute = {};
      if (typeof page === 'string') {
        var m = /^([^?#]*)(\?[^#]*)?(#.*)$/.exec(page);
        if (m) {
          pageRoute.pathname = page = m[1];
          pageRoute.search = m[2];
          pageRoute.hash = m[3];
        }
        pageRoute.pathname = page;

      } else {
        if (page == null)
          page = koru.getLocation();
        else if (! ('pathname' in page))
          return this.gotoPage.apply(this, arguments);

        if ('search' in page)
          pageRoute.search = page.search;

        if ('hash' in page)
          pageRoute.hash = page.hash;

        pageRoute.pathname = page = page.pathname;
      }

      var parts = page.split('/');
      var root = this.root;
      page = root;

      var newPage = root.defaultPage;
      for(var i = 0; i < parts.length; ++i) {
        var part = parts[i];
        if (! part) continue;
        newPage = (('routes' in page) && page.routes[part]);
        if (! newPage) {
          newPage = page.defaultPage;

          if (page.routeVar) {
            if (page.routeVar in pageRoute) {
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
        throw new Error('Page not found');

      this.gotoPage(page, pageRoute);
    },

    searchParams: function (pageRoute) {
      var result = {};

      var search = pageRoute && pageRoute.search;
      if (! search) return result;


      search.slice(1).split('&').forEach(function (pair) {
        var items = pair.split('=');
        result[items[0]] = items[1];
      });

      return result;
    },
  });

  function exitEntry(exit, oldSymbols, entry, pageRoute, page) {
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

    for(index = index - diff - 1 ; index >= 0; --index) {
      item = entry[index];
      currentPage = item;
      item.onBaseEntry(page, pageRoute);
    }
  }

  function pathname(template, pageRoute) {
    if (template && ('route' in template)) {
      var path = routePath(template.route, pageRoute)+'/'+template.subPath;
    } else
      var path = '';

    if ('append' in pageRoute)
      return path + '/' + pageRoute.append;

    return path;
  }

  function routePath(route, pageRoute) {
    if (! route) return '';

    var path = route.path;
    var sym = route.routeVar;
    if (sym && (sym in pageRoute))
      path += '/' + pageRoute[sym];

    if (! route.parent) return path;
    return routePath(route.parent, pageRoute)+'/'+path;
  }

  function toPath(route) {
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

  function onEntryFunc(template, options) {
    return function (page, pageRoute) {
      if (options) {
        if (typeof options.data ==='function') {
          var data = options.data.apply(template, arguments);
        } else {
          var data = options.data;
        }
      }
      var route = template.route;


      if (route && route.template) {
        var parent = document.getElementById(route.template.name);
        if (parent)
          parent = parent.getElementsByClassName('body')[0] || parent;
      }
      (parent || document.body).appendChild(template._renderedPage = template.$autoRender(data||{}));
      if (options.focus) {
        Dom.focus(template._renderedPage, options.focus);
      }
    };
  }

  function onExitFunc(template) {
    return function () {
      Dom.remove(template._renderedPage || document.getElementById(template.name));
    };
  }

  return Route;
});
