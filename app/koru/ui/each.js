define((require, exports, module)=>{
  const AutoList        = require('koru/ui/auto-list');
  const Dom             = require('../dom');
  const Query           = require('../model/query');
  const util            = require('../util');

  const {private$, endMarker$} = require('koru/symbols');
  const $ = Dom.current;

  const each$ = Symbol();
  const {COMMENT_NODE} = document;

  const each = (startEach, data, args, options={})=>{
    const {
      template: templateName=typeof args === 'string' ? `Each_${args}` : 'Each_row'
    } = options;
    let each = startEach[each$];
    if (each === undefined) {
      each = new Each(startEach);
      startEach = each.startEach;
      startEach[each$] = each;
    }

    const pv = each[private$];

    if (pv.args !== args) {
      pv.args = args;
      const {parentCtx} = each;
      const ctpl = $.template;
      pv.helper = typeof args === 'string' ? ctpl._helpers[args] : args;

      if (pv.helper === undefined) {
        throw new Error(
          (typeof args === 'string' ? `helper "${args}" not found` : `invalid call to each`)+
            ` in template "${ctpl.name}"`);
      }
    }

    if (pv.templateName !== templateName) {
      pv.templateName = templateName;
      let template = null;

      if (typeof templateName === 'object') {
        if ('$autoRender' in templateName)
          template = templateName;
        else
          templateName = templateName.toString();
      }

      if (template == null) {
        const ctpl = $.template;
        template = Dom.lookupTemplate.call(ctpl, templateName) ||
          Dom.lookupTemplate(templateName);
        if (template == null) throw new Error(
          `template "${templateName}" not found in template "${ctpl.name}"`);
      }

      pv.template = template;
    }

    let result = typeof pv.helper === 'function'
          ? pv.helper.call(data, each, options)
          : pv.helper;

    if (result != null) {
      if (Array.isArray(result))
        each.staticList(result, options);
      else {
        if (('forEach' in result))
          result = {query: result};
        if (pv.list === null) {
          each.autoList(result);
        } else {
          pv.list.changeOptions(result);
        }
      }
    }

    return startEach;
  };

  Dom.registerHelpers({
    each(func, options) {return each($.element, this, func, options)},
  });

  class Each {
    constructor(insertPoint) {
      this[private$] = {
        template: null, templateName: null, args: null,
        helper: null, list: null
      };
      this.parentCtx = $.ctx;
      this.startEach = document.createComment('start');
      this.endEach = this.startEach[endMarker$] = document.createComment('end');
      insertPoint.parentNode.insertBefore(this.endEach, insertPoint.nextSibling);
      insertPoint.parentNode.insertBefore(this.startEach, this.endEach);
    }

    autoList(options) {
      const pv = this[private$];
      if (pv.list !== null) pv.list.stop();
      pv.list = new AutoList(Object.assign({
        template: pv.template,
        container: this.startEach,
        parentCtx: this.parentCtx}, options));
    }

    clear() {
      const {endEach} = this;
      let n = endEach.previousSibling;
      while (n != null && n.nodeType !== COMMENT_NODE && n[endMarker$] != endEach) {
        const p = n.previousSibling;
        Dom.remove(n);
        n = p;
      }
    }

    get list() {return this[private$].list}

    append(row) {
      if (! row) return;
      const {endEach} = this;
      const elm = (row.nodeType) ? row : this[private$].template.$autoRender(
          Array.isArray(row) ? {_id: row[0], name: row[1]} : row,
        this.parentCtx);
      endEach.parentNode.insertBefore(elm, endEach);
      return elm;
    }

    staticList(list, options={}) {
      this.clear();

      const {map} = options;
      list.forEach(src => {
        this.append(map == null ? src : map(src));
      });
    }
  }

  return each;
});
