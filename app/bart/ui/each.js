define(function(require, exports, module) {
  var Dom = require('../dom');
  var $ = Dom.current;
  var Query = require('../model/query');
  var util = require('../util');

  Dom.registerHelpers({
    each: function (func, options) {
      var startEach = $.element;
      var each = startEach._each;
      if (! each) {
        startEach = createEach(func, options);
        each = startEach._each;
      }
      each.call(this, options);

      return startEach;
    },
  });

  function createEach(func, options) {
    var eachCtx = $.ctx;
    var ctpl = $.template;
    var helper = ctpl._helpers[func];
    if (! helper)
      throw new Error("helper '" + func +
                      "' not found in template '" + ctpl.name + "'");

    if (typeof func !== 'string')
      throw new Error("first argument must be name of helper method to call");

    var startEach = document.createComment('start');
    var endEach = startEach._bartEnd = document.createComment('end');
    $.element.parentNode.insertBefore(endEach, $.element.nextSibling);

    var rows = {};
    options = options || {};
    var templateName = options.template || "Each_" + func;

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

    callback.render = callbackRender;
    callback.clear = function () {
      var parent = startEach.parentNode;
      if (! parent) return;
      for(var key in rows) {
        Dom.remove(rows[key]);
      }
      rows = callback.rows = {};
    };
    callback.count = 0;
    callback.rows = rows;

    startEach._each = each;

    return startEach;

    function each(options) {
      callback.count++;
      helper.call(this, callback, options, startEach);
    }

    function insert(elm, sort) {
      var a = $.data(elm);
      var before = endEach;
      if (sort) {
        var prev;
        for(var prev; (prev = before.previousSibling) !== startEach; before = prev)  {
          var b = $.data(prev);
          if (a !== b && sort(a, b) >= 0) break;
        }
      }

      endEach.parentNode.insertBefore(elm, before);
    }

    function callback(doc, old, sort) {
      var id = (doc || old);
      id = id._id || id.id;
      var elm = rows[id];
      if (elm) {
        if (doc) {
          Dom.getCtx(elm).updateAllTags(doc);
          if (! old || (sort && sort(doc, old) != 0))
            insert(elm, sort);
        } else {
          delete rows[id];
          Dom.remove(elm);
        }
        return;
      }
      if (! doc) return;
      var parentNode = endEach.parentNode;
      if (! parentNode) return;
      insert(rows[id] = row.$autoRender(doc, eachCtx), sort);
    }
  }

  function callbackRender(options) {
    var callback = this;
    var model = options.model;
    var params = options.params;
    var filter = options.filter;
    var changed = options.changed;

    var sortFunc = options.sort;
    if (typeof sortFunc === 'string')
      sortFunc = Apputil.compareByField(sortFunc);

    if (callback._renderDestroy) {
      callback._renderDestroy();
    } else {
      callback._renderDestroy = function () {
        if (callback._observeHandle) {
          callback._observeHandle.stop();
          callback._observeHandle = null;
        }
        callback.clear();
      };
      $.ctx.onDestroy(callback._renderDestroy);
    }

    params = params || {};
    var results = options.index ? options.index.fetch(params) : new Query(model).where(params).fetch();
    if (filter) results = results.filter(function (doc) {
      return filter(doc);
    });
    results.sort(sortFunc)
      .forEach(function (doc) {callback(doc)});

    callback._observeHandle = model.observe(function (doc, old) {
      if (params) {
        if (old && ! util.includesAttributes(params, old)) old = null;
        if (doc && ! util.includesAttributes(params, doc)) doc = null;
      }

      if (filter) {
        if (old && ! filter(old)) old = null;
        if (doc && ! filter(doc)) doc = null;
      }

      if (doc || old) {
        callback(doc && new model(doc), old && new model(old), sortFunc);
        changed && changed();
      }
    });
  }
});
