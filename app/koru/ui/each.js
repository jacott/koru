define(function(require, exports, module) {
  const Dom   = require('../dom');
  const Query = require('../model/query');
  const util  = require('../util');

  const $ = Dom.current;

  function each(startEach, data, func, options) {
    let each = startEach._each;
    if (! each) {
      startEach = createEach(startEach, func, options);
      each = startEach._each;
    }
    each.call(data, options);

    return startEach;
  }

  Dom.registerHelpers({
    each(func, options) {
      return each($.element, this, func, options);
    },
  });

  function createEach(insertPoint, func, options) {
    const eachCtx = $.ctx;
    const ctpl = $.template;
    const helper = ctpl._helpers[func] || Dom._helpers[func];
    if (! helper)
      throw new Error("helper '" + func +
                      "' not found in template '" + ctpl.name + "'");

    if (typeof func !== 'string')
      throw new Error("first argument must be name of helper method to call");

    const startEach = document.createComment('start');
    const endEach = startEach._koruEnd = document.createComment('end');
    insertPoint.parentNode.insertBefore(endEach, insertPoint.nextSibling);
    insertPoint.parentNode.insertBefore(startEach, endEach);

    const rows = Object.create(null);
    options = options || {};
    const templateName = options.template || "Each_" + func;

    if (typeof templateName === 'object') {
      if ('$autoRender' in templateName)
        var row = templateName;
      else
        templateName = templateName.toString();
    }

    if (! row) {
      var row = Dom.lookupTemplate.call(ctpl, templateName) ||
            Dom.lookupTemplate(templateName);
      if (! row) throw new Error("template '" + templateName +
                                 "' not found in template '" + ctpl.name + "'");
    }

    callback.setDefaultDestroy = setDefaultDestroy;
    callback.render = callbackRender;
    callback.clear = function (func) {
      const parent = startEach.parentNode;
      if (! parent) return;
      for(let key in rows) {
        const row = rows[key];
        if (! func || func(row)) {
          delete rows[key];
          Dom.remove(row);
        }
      }
    };
    callback.count = 0;
    callback.rows = rows;
    callback.startEach = startEach;

    startEach._each = each;

    return startEach;

    function each(options) {
      callback.count++;
      helper.call(this, callback, options, startEach);
    }

    function insert(elm, sort) {
      const a = $.data(elm);
      let before = endEach;
      if (typeof sort === 'function') {
        for(let prev; (prev = before.previousSibling) !== startEach; before = prev)  {
          const b = $.data(prev);
          if (a !== b && sort(a, b) >= 0) break;
        }
      } else if (sort)
        before = sort;

      endEach.parentNode.insertBefore(elm, before);
    }

    function callback(doc, old, sort) {
      const data = (doc || old);
      if (! data) return;
      const id = data._id || data.id;
      const elm = id && rows[id];
      if (elm) {
        if (doc) {
          Dom.getCtx(elm).updateAllTags(doc);
          if (! old || (sort && sort(doc, old) != 0)) {
            insert(elm, sort);
            return elm;
          }
        } else {
          delete rows[id];
          Dom.remove(elm);
        }
        return;
      }
      if (! doc) return;
      const parentNode = endEach.parentNode;
      if (! parentNode) return;
      const rendered = row.$autoRender(doc, eachCtx);
      if (id) rows[id] = rendered;
      insert(rendered, sort);
      return rendered;
    }
  }

  function setDefaultDestroy() {
    const callback = this;
    if (callback._destroy) {
      callback._destroy();
    } else {
      $.ctx.onDestroy(callback._destroy = function () {
        callback._handle && callback._handle.stop();
        callback._handle = null;
        callback.clear();
      });
    }
  }

  function callbackRender({model,  params,  filter,  changed,  intercept, sort, index}) {
    const callback = this;

    if (typeof sort === 'string')
      sort = util.compareByField(sort);

    callback.setDefaultDestroy();

    params = params || {};
    var results = index ? index.fetch(params) : model.where(params).fetch();
    if (filter) results = results.filter(doc => filter(doc));

    util.forEach(results.sort(sort), doc => {
      if (! (intercept && intercept(doc)))
        callback(doc);
    });

    callback._handle = model.onChange(function (doc, was) {
      var old = doc ? doc.$withChanges(was) : was;
      if (doc && params && ! util.includesAttributes(params, doc)) doc = null;
      if (old && params && ! util.includesAttributes(params, old)) old = null;

      if (filter) {
        if (old && ! filter(old)) old = null;
        if (doc && ! filter(doc)) doc = null;
      }

      if ((doc || old) && ! (intercept && intercept(doc, old))) {
        callback(doc, old, sort);
        changed && changed(doc, was);
      }
    });
  }

  return each;
});
