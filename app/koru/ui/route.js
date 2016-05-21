define(function(require, exports, module) {
  var koru = require('../main');
  var util = require('../util');
  var Dom = require('../dom');
  require('koru/ui/dom-ext');
  var Trace = require('../trace');
  var makeSubject = require('../make-subject');

  var debug_page = false;
  Trace.debug_page = function (value) {
    debug_page = value;
  };

  function Route(path, template, parent, options) {
    if (options) {
      if (typeof options === 'string')
        this.routeVar = options;
      else
        util.extend(this, options);
    }

    this.path = path || '';
    this.template = template;
    this.parent = parent;
    this.routes = {};
  };

  makeSubject(Route);

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
      if (! template.onEntry)
        template.onEntry = onEntryFunc(template, options);

      if (! template.onExit)
        template.onExit = onExitFunc(template);
    },

    removeTemplate: function (template, options) {
      var path = options && options.path;
      if (path == null) path = templatePath(template);
      delete this.routes[path];
    },

    addDialog: function (module, template, options) {
      if (module && ! module.exports) {
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

    addBase: function (module, template, options) {
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
    },

    removeBase: function (template) {
      delete template.route;
      delete this.routes[template.$path];
    },

    onBaseExit: function(page, location) {
      var template = this.template;
      var onBaseExit = template && template.onBaseExit;
      onBaseExit && onBaseExit.call(template, page, location);
    },

    onBaseEntry: function(page, location, callback) {
      var template = this.template;
      var onBaseEntry = template && template.onBaseEntry;
      onBaseEntry && onBaseEntry.call(template, page, location, callback);
    },
  };

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

  const excludes = Object.freeze({append: 1, href: 1, hash: 1, search: 1});
  var inGotoPage = 0;
  var currentPage = null;
  var targetPage = null;
  var currentPageRoute = {};
  var currentTitle, currentHref;
  var pageState = 'pushState';
  var pageCount = 0;
  var runInstance; // used with async callbacks

  util.extend(Route, {
    root: new Route(),

    get pageState() {return pageState},
    get pageCount() {return pageCount},

    waitForPage: function (expectPage, duration) {
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
        var handle = Route.onChange(function (actualPage, href) {
          handle.stop();
          koru.clearTimeout(timeout);
          if (actualPage === expectPage)
            resolve(actualPage, href);
          else
            reject(new Error('expected page: ' + (expectPage && expectPage.name) +
                             ', got: ' + (actualPage && actualPage.name)));
        });
      });
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

    _reset: function () {
      Route.replacePage();
      pageCount = 0;
    },

    pathname: pathname,

    replacePage: function () {
      pageState = 'replaceState';
      try {
        return this.gotoPage.apply(this, arguments);
      } finally {
        pageState = 'pushState';
      }
    },

    gotoPage: function (page, pageRoute) {
      if (page && ! page.onEntry) {
        page = page.route ? page.route.defaultPage : page.defaultPage;
      }

      pageRoute = util.reverseExtend(pageRoute || {},  currentPageRoute, excludes);
      pageRoute.pathname = pathname(page, pageRoute || {});

      debug_page && koru.logger('D', 'gotoPage', util.inspect(pageRoute, 2));

      Route.loadingArgs = [page, pageRoute];

      if (page && page.routeOptions && page.routeOptions.privatePage && ! koru.userId()) {
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

          var finished = exitEntry(toPath(currentPage.$autoRender ? currentPage.route : currentPage), currentPageRoute, toPath(page && page.route), pageRoute, page, then);
        } else {
          var finished = exitEntry([], {}, toPath(page && page.route), pageRoute, page, then);
        }

        function then() {
          if (! page) {
            var href = null;
            var title = Route.title;
            pageRoute = {};
          } else {
            page = page.Index || page;
            var href = page.onEntry(page, pageRoute) || pageRoute.pathname+(pageRoute.search||'')+(pageRoute.hash||'');
            if (! href.match(/^\/#/)) href = '/#' + (href[0] === '/' ? href.slice(1) : href);
            var title = page.title || Route.title;
          }

          Route.recordHistory(page, href);
          currentHref = href;
          currentPage = page;
          Route.setTitle(title);
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
    },

    recordHistory: function (page, href) {
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
      Route.notify(page, href);
    },

    setTitle: function (title) {
      currentTitle = document.title = title;
      Dom.setTitle && Dom.setTitle(title);
    },

    pushCurrent: function () {
      Route.history.pushState(++pageCount, null, currentHref);
    },

    get targetPage() {return targetPage},
    get currentPage() {return currentPage},
    get currentPageRoute() {return currentPageRoute},
    get currentHref() {return currentHref},
    get currentTitle() {return currentTitle},

    pageChanged: function (state) {
      pageCount = state || 0;
      pageState = null;
      try {
        return this.gotoPath();
      } finally {
        pageState = 'pushState';
      }
    },

    replacePath: function () {
      pageState = 'replaceState';
      try {
        return this.gotoPath.apply(this, arguments);
      } finally {
        pageState = 'pushState';
      }
    },

    gotoPath: function (page) {
      var pageRoute = {};
      if (page == null)
        page = koru.getLocation();

      if (typeof page !== 'string') {
        if (! page.pathname)
          return this.gotoPage.apply(this, arguments);

        if (page.pathname !== '/') {
          page = '/#'+page.pathname+(page.search || '')+ (page.hash || '');
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
    },

    searchParams: function (pageRoute) {
      var result = {};

      var search = pageRoute && pageRoute.search;
      if (! search) return result;


      util.forEach(search.slice(1).split('&'), function (pair) {
        var items = pair.split('=');
        result[items[0]] = items[1];
      });

      return result;
    },
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
        item.onBaseEntry(page, pageRoute);
        callback();
      }
    }
    callback();
  }

  function pathname(template, pageRoute) {
    if (template && template.route) {
      var path = routePath(template.route, pageRoute)+'/'+template.subPath;
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
      options.afterRendered && options.afterRendered(template._renderedPage, pageRoute);
    };
  }

  function onExitFunc(template) {
    return function () {
      Dom.remove(template._renderedPage || document.getElementById(template.name));
    };
  }

  return Route;
});
